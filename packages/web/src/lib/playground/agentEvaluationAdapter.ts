import { toPiTool, type AgentConfig, type ToolDefinition } from "@memora/ai-core";
import type { AgentAdapter, AgentAnswer, AgentCitation } from "@memora/evaluation";

import * as agentRuntime from "@/lib/agent-runtime/client";
import type { AgentSubmission, SessionSnapshot } from "@/lib/agent-runtime/protocol";
import type { TraceEvent } from "@/lib/agent-runtime/traceRecorder";
import { parseMemoraJumpContent } from "@/lib/chat/memoraJump";
import { EMPTY_REFERENCE_SCOPE, SYSTEM_PROMPT } from "@/lib/chat/tools";

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

type RuntimeClient = Pick<typeof agentRuntime, "command" | "getSnapshot" | "subscribe">;

export interface WebAgentAdapterOptions {
  provider: AgentSubmission["provider"];
  compactionProvider?: AgentSubmission["compactionProvider"];
  config: Partial<AgentConfig>;
  /** The chat tools; only the read-only ones are offered. */
  tools: ToolDefinition[];
  runtime?: RuntimeClient;
}

const isFinished = (snapshot: SessionSnapshot, submissionId: string): boolean =>
  Boolean(
    snapshot.acceptedSubmissionIds?.includes(submissionId) &&
    !snapshot.activeRunId &&
    snapshot.pending.length === 0 &&
    snapshot.outcome,
  );

/** Counts the Run's `context.trimmed` events; a Trace that never settled (or none) is "unknown". */
const readFallbackTrims = async (
  runtime: RuntimeClient,
  sessionId: string,
  runId: string,
): Promise<number | "unknown"> => {
  try {
    const events = await runtime.command({ type: "read-trace", sessionId, runId });
    if (!Array.isArray(events)) return "unknown";
    const types = (events as TraceEvent[]).map((event) => event.type);
    if (!types.includes("run.settled")) return "unknown";
    return types.filter((type) => type === "context.trimmed").length;
  } catch {
    return "unknown";
  }
};

/**
 * Answers each question in a fresh `eval-<uuid>` in-memory session with the chat system prompt
 * and the read-only tools, and deletes the session afterwards, whatever the outcome. Deleting
 * flushes the Run's Trace, which is then read for the fallback trim count.
 */
export async function createWebAgentAdapter(
  options: WebAgentAdapterOptions,
): Promise<AgentAdapter> {
  const runtime = options.runtime ?? agentRuntime;
  const allowed = new Set<string>(EVALUATION_TOOL_NAMES);
  const tools = options.tools
    .filter((tool) => allowed.has(tool.name))
    .map((tool) => {
      const value = toPiTool(tool);
      return {
        name: value.name,
        description: value.description,
        parameters: value.parameters as Record<string, unknown>,
      };
    });
  const prompt = { ...SYSTEM_PROMPT, content: String(SYSTEM_PROMPT.content) };

  return {
    identity: {
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
        notices: "none",
      },
    },
    async answer(question, signal): Promise<AgentAnswer> {
      const sessionId = `eval-${crypto.randomUUID()}`;
      const submissionId = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      let unsubscribe = () => {};
      let result: Omit<AgentAnswer, "fallbackTrims">;
      try {
        const finished = new Promise<SessionSnapshot>((resolve, reject) => {
          if (signal.aborted) return reject(signal.reason);
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          unsubscribe = runtime.subscribe(
            sessionId,
            () => {
              const snapshot = runtime.getSnapshot(sessionId);
              if (isFinished(snapshot, submissionId)) resolve(snapshot);
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
              content: [{ type: "text", text: question.question }],
            },
            message: { id: messageId, role: "user", content: question.question },
            mode: "pending",
            provider: options.provider,
            ...(options.compactionProvider
              ? { compactionProvider: options.compactionProvider }
              : {}),
            config: { ...options.config, id: `memora-chat:${sessionId}` } as AgentConfig,
            prompts: [prompt],
            tools,
            scope: EMPTY_REFERENCE_SCOPE,
          },
        });
        const snapshot = await finished;
        if (snapshot.outcome !== "completed")
          throw new Error(snapshot.error ?? `The Run ended as ${snapshot.outcome}.`);
        const reply = snapshot.messages.findLast((message) => message.role === "assistant");
        const answer = reply?.content ?? "";
        result = {
          answer,
          citations: citationsFrom(answer),
          sessionId,
          runId: submissionId,
          ...(reply?.usage ? { usage: { ...reply.usage } as Record<string, number> } : {}),
        };
      } finally {
        unsubscribe();
        await runtime
          .command({ type: "delete", sessionId, storage: "memory" })
          .catch((error: unknown) => console.error("Could not delete evaluation session:", error));
      }
      return {
        ...result,
        fallbackTrims: await readFallbackTrims(runtime, sessionId, submissionId),
      };
    },
  };
}
