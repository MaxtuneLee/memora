import { toPiTool, type AgentConfig, type ToolDefinition } from "@memora/ai-core";
import {
  AgentAttemptError,
  READ_SESSION_TOOL,
  REMEMBER_TOOL,
  type AgentAdapter,
  type AgentAnswer,
  type AgentCitation,
  type MemoryAdapter,
  type MemoryReply,
  type PastSession,
} from "@memora/evaluation";
import * as v from "valibot";

import * as agentRuntime from "@/lib/agent-runtime/client";
import type { AgentSubmission, SessionSnapshot } from "@/lib/agent-runtime/protocol";
import {
  buildSummary,
  SESSION_SCHEMA_VERSION,
  type ChatSessionRecord,
} from "@/lib/chat/chatSessionStorage";
import { readRun } from "@/lib/agent-runtime/traceReader";
import type { TraceEvent } from "@/lib/agent-runtime/traceRecorder";
import { summarizeRun } from "@/lib/agent-runtime/traceTimeline";
import { parseMemoraJumpContent } from "@/lib/chat/memoraJump";
import { EMPTY_REFERENCE_SCOPE, SYSTEM_PROMPT } from "@/lib/chat/tools";
import type { CreateChatToolsOptions } from "@/lib/chat/tools/shared";

import { sha256Hex } from "./evaluationImport";

/** Read-only retrieval: no file writes, no global memory, no other chats. */
export const EVALUATION_TOOL_NAMES = [
  "describe_table",
  "query_db",
  "read_file",
  "grep_files",
  "search_files",
  "read_extracted_content",
  "search_transcript",
] as const;

/** Only `<memora-jump />` tags count; a time written in prose never does. */
export const citationsFrom = (answer: string): AgentCitation[] =>
  parseMemoraJumpContent(answer).flatMap((part) =>
    part.type === "jump"
      ? [
          {
            fileId: part.jumpCard.fileId,
            startSec: part.jumpCard.startSec,
            endSec: part.jumpCard.endSec,
          },
        ]
      : [],
  );

/** The memory evaluation adds the tools that save preferences and read earlier chats. */
export const MEMORY_EVALUATION_TOOL_NAMES = [
  ...EVALUATION_TOOL_NAMES,
  "list_chat_sessions",
  READ_SESSION_TOOL,
  REMEMBER_TOOL,
] as const;

type RuntimeClient = Pick<
  typeof agentRuntime,
  "command" | "getSnapshot" | "subscribe" | "registerSessionToolHost"
>;

export interface WebAgentAdapterOptions {
  provider: AgentSubmission["provider"];
  compactionProvider?: AgentSubmission["compactionProvider"];
  config: Partial<AgentConfig>;
  /** The chat tools; only the read-only ones are offered. */
  tools: ToolDefinition[];
  /** Names the memory profile the questions are answered under, for the identity. */
  memoryProfileId?: string;
  runtime?: RuntimeClient;
}

const isFinished = (snapshot: SessionSnapshot, submissionId: string): boolean =>
  Boolean(
    snapshot.acceptedSubmissionIds?.includes(submissionId) &&
    !snapshot.activeRunId &&
    snapshot.pending.length === 0 &&
    snapshot.outcome,
  );

/**
 * Counts the Run's `context.trimmed` events and sums the tokens of every model call; a Trace that
 * never settled (or none) gives "unknown" trims and no tokens.
 */
const readTraceFacts = async (
  runtime: RuntimeClient,
  sessionId: string,
  runId: string,
): Promise<Pick<AgentAnswer, "fallbackTrims" | "tokens">> => {
  try {
    const events = await runtime.command({ type: "read-trace", sessionId, runId });
    if (!Array.isArray(events)) return { fallbackTrims: "unknown" };
    const run = readRun(events as TraceEvent[]);
    if (!run.complete) return { fallbackTrims: "unknown" };
    const { inputTokens, cachedTokens, outputTokens } = summarizeRun(run);
    return {
      fallbackTrims: run.events.filter((event) => event.type === "context.trimmed").length,
      tokens: { input: inputTokens, cached: cachedTokens, output: outputTokens },
    };
  } catch {
    return { fallbackTrims: "unknown" };
  }
};

const describeTools = (tools: ToolDefinition[], names: readonly string[]) =>
  tools
    .filter((tool) => names.includes(tool.name))
    .map((tool) => {
      const value = toPiTool(tool);
      return {
        name: value.name,
        description: value.description,
        parameters: value.parameters as Record<string, unknown>,
      };
    });

interface SessionRequest {
  sessionId: string;
  text: string;
  tools: AgentSubmission["tools"];
  notices?: string[];
  signal: AbortSignal;
}

/**
 * Sends one message to a fresh in-memory session and deletes the session afterwards, whatever the
 * outcome. Deleting flushes the Run's Trace, which is then read for the fallback trim count and
 * token totals. A failed or canceled Run throws `AgentAttemptError` carrying the same Trace facts.
 */
type SessionOptions = Omit<WebAgentAdapterOptions, "tools">;

const runSession = async (
  runtime: RuntimeClient,
  options: SessionOptions,
  prompt: AgentSubmission["prompts"][number],
  { sessionId, text, tools, notices, signal }: SessionRequest,
): Promise<
  { reply: SessionSnapshot["messages"][number] | undefined; runId: string } & Awaited<
    ReturnType<typeof readTraceFacts>
  >
> => {
  const submissionId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  let unsubscribe = () => {};
  let snapshot: SessionSnapshot | undefined;
  let failure: unknown;
  try {
    const finished = new Promise<SessionSnapshot>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      unsubscribe = runtime.subscribe(
        sessionId,
        () => {
          const next = runtime.getSnapshot(sessionId);
          if (isFinished(next, submissionId)) resolve(next);
        },
        "memory",
      );
    });
    // Settled below; this only keeps an early cancel from surfacing as unhandled.
    finished.catch(() => {});
    await runtime.command({
      type: "submit",
      sessionId,
      storage: "memory",
      submission: {
        id: submissionId,
        input: {
          id: messageId,
          role: "user",
          createdAt: Date.now(),
          content: [{ type: "text", text }],
        },
        message: { id: messageId, role: "user", content: text },
        mode: "pending",
        provider: options.provider,
        ...(options.compactionProvider ? { compactionProvider: options.compactionProvider } : {}),
        config: { ...options.config, id: `memora-chat:${sessionId}` } as AgentConfig,
        prompts: [prompt],
        tools,
        scope: EMPTY_REFERENCE_SCOPE,
        ...(notices?.length ? { memory: { notices } } : {}),
      },
    });
    snapshot = await finished;
    if (snapshot.outcome !== "completed")
      throw new Error(snapshot.error ?? `The Run ended as ${snapshot.outcome}.`);
  } catch (error) {
    failure = error;
  } finally {
    unsubscribe();
    await runtime
      .command({ type: "delete", sessionId, storage: "memory" })
      .catch((error: unknown) => console.error("Could not delete evaluation session:", error));
  }
  const facts = await readTraceFacts(runtime, sessionId, submissionId);
  if (failure !== undefined || !snapshot)
    throw new AgentAttemptError(
      failure instanceof Error ? failure.message : String(failure),
      { sessionId, runId: submissionId, ...facts },
      { cause: failure },
    );
  return {
    reply: snapshot.messages.findLast((message) => message.role === "assistant"),
    runId: submissionId,
    ...facts,
  };
};

const identityOf = async (
  options: SessionOptions,
  prompt: AgentSubmission["prompts"][number],
  tools: AgentSubmission["tools"],
  notices: string,
) => ({
  adapter: "memora-web",
  model: options.provider.selectedModelId,
  promptRevision: await sha256Hex(new TextEncoder().encode(prompt.content)),
  tools: tools.map((tool) => tool.name),
  settings: {
    provider: options.provider.name,
    apiFormat: options.provider.apiFormat ?? null,
    compactionModel: options.compactionProvider?.selectedModelId ?? null,
    maxIterations: options.config.maxIterations ?? null,
    compaction: Boolean(options.config.compaction),
    personality: "none",
    notices,
  },
});

const chatPrompt = () => ({ ...SYSTEM_PROMPT, content: String(SYSTEM_PROMPT.content) });

/**
 * Answers each question in a fresh `eval-<uuid>` in-memory session with the chat system prompt
 * and the read-only tools. A question with notices is answered with them as the stored preferences.
 */
export async function createWebAgentAdapter(
  options: WebAgentAdapterOptions,
): Promise<AgentAdapter> {
  const runtime = options.runtime ?? agentRuntime;
  const tools = describeTools(options.tools, EVALUATION_TOOL_NAMES);
  const prompt = chatPrompt();

  return {
    identity: await identityOf(options, prompt, tools, options.memoryProfileId ?? "none"),
    async answer(question, signal): Promise<AgentAnswer> {
      const sessionId = `eval-${crypto.randomUUID()}`;
      const { reply, runId, ...facts } = await runSession(runtime, options, prompt, {
        sessionId,
        text: question.question,
        tools,
        notices: question.notices,
        signal,
      });
      const answer = reply?.content ?? "";
      return {
        answer,
        citations: citationsFrom(answer),
        sessionId,
        runId,
        ...(reply?.usage ? { usage: { ...reply.usage } as Record<string, number> } : {}),
        ...facts,
      };
    },
  };
}

export interface WebMemoryAdapterOptions extends Omit<WebAgentAdapterOptions, "tools"> {
  /** The chat tools, built with the evaluation's stand-ins for memory and chat history. */
  createTools: (
    standIns: Required<Pick<CreateChatToolsOptions, "saveMemoryNotices" | "chatSessions">>,
  ) => ToolDefinition[];
  sessions: PastSession[];
}

const toRecord = (session: PastSession): ChatSessionRecord => {
  const time = Date.parse(session.updatedAt);
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: session.sessionId,
    title: session.title,
    createdAt: time,
    updatedAt: time,
    messages: session.messages.map((message, index) => ({
      id: `${session.sessionId}-${index}`,
      ...message,
    })),
    references: [],
    agentStore: {},
  };
};

/**
 * Answers each memory case in a fresh in-memory session whose tool calls run in this Window: the
 * preference tool extracts notices as usual but keeps them with the attempt instead of the user's
 * memory, and the session tools see only the evaluation's past sessions.
 */
export async function createWebMemoryAdapter(
  options: WebMemoryAdapterOptions,
): Promise<MemoryAdapter> {
  const runtime = options.runtime ?? agentRuntime;
  const records = options.sessions.map(toRecord);
  const chatSessions = {
    list: async () => records.map(buildSummary).sort((a, b) => b.updatedAt - a.updatedAt),
    load: async (sessionId: string) =>
      structuredClone(records.find((record) => record.id === sessionId) ?? null),
  };
  const prompt = chatPrompt();
  const describedTools = describeTools(
    options.createTools({
      saveMemoryNotices: async () => ({ updated: false, noticeCount: 0 }),
      chatSessions,
    }),
    MEMORY_EVALUATION_TOOL_NAMES,
  );

  return {
    identity: await identityOf(options, prompt, describedTools, "none"),
    async converse({ message }, signal): Promise<MemoryReply> {
      const sessionId = `eval-${crypto.randomUUID()}`;
      const toolCalls: MemoryReply["toolCalls"] = [];
      const notices: string[] = [];
      const tools = options.createTools({
        saveMemoryNotices: async (extracted) => {
          notices.push(...extracted);
          return { updated: extracted.length > 0, noticeCount: notices.length };
        },
        chatSessions,
      });
      const release = runtime.registerSessionToolHost(sessionId, async (call) => {
        toolCalls.push({ name: call.name, args: call.args });
        const tool = tools.find((item) => item.name === call.name);
        if (!tool || !(MEMORY_EVALUATION_TOOL_NAMES as readonly string[]).includes(call.name))
          throw new Error(`Unknown tool: ${call.name}`);
        return tool.execute(v.parse(tool.parameters, call.args));
      });
      try {
        const { reply, runId, ...facts } = await runSession(runtime, options, prompt, {
          sessionId,
          text: message,
          tools: describedTools,
          signal,
        });
        return { answer: reply?.content ?? "", toolCalls, notices, sessionId, runId, ...facts };
      } finally {
        release();
      }
    },
  };
}
