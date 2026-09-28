import { AgentAttemptError } from "@memora/evaluation";
import { describe, expect, it, vi } from "vite-plus/test";

import type { AgentCommand, SessionSnapshot } from "@/lib/agent-runtime/protocol";
import { emptySessionSnapshot } from "@/lib/agent-runtime/sessionRuntime";
import type { TraceEvent } from "@/lib/agent-runtime/traceRecorder";
import { createChatTools } from "@/lib/chat/tools";
import type { ToolHost } from "@/lib/agent-runtime/client";
import {
  citationsFrom,
  createWebAgentAdapter,
  createWebMemoryAdapter,
  EVALUATION_TOOL_NAMES,
  MEMORY_EVALUATION_TOOL_NAMES,
} from "@/lib/playground/agentEvaluationAdapter";

const ANSWER =
  'Word2vec is covered here <memora-jump fileId="eval-abc-lec11" fileName="Lecture 11" mediaType="video" startSec="12" endSec="18.5" context="x" /> and in prose at 3:10.';

type Outcome = "completed" | "failed" | "never";

const event = (type: string): TraceEvent => ({
  formatVersion: 1,
  sessionId: "s",
  runId: "r",
  sequence: 0,
  timestamp: 0,
  type,
});

/**
 * Stands in for the agent runtime client; finishes each submission with the given outcome and
 * serves `trace` only once the session is deleted, as deletion flushes it.
 */
const fakeRuntime = (
  outcome: Outcome,
  trace: TraceEvent[] = [],
  toolCalls: Array<{ name: string; args: unknown }> = [],
) => {
  const hosts = new Map<string, ToolHost>();
  const toolResults: unknown[] = [];
  const snapshots = new Map<string, SessionSnapshot>();
  const listeners = new Map<string, () => void>();
  const commands: AgentCommand[] = [];
  const live = new Set<string>();
  return {
    commands,
    live,
    hosts,
    toolResults,
    registerSessionToolHost: (sessionId: string, host: ToolHost) => {
      hosts.set(sessionId, host);
      return () => hosts.delete(sessionId);
    },
    getSnapshot: (sessionId: string) => snapshots.get(sessionId) ?? emptySessionSnapshot(sessionId),
    subscribe: vi.fn((sessionId: string, listener: () => void, _storage?: "memory") => {
      listeners.set(sessionId, listener);
      live.add(sessionId);
      return () => listeners.delete(sessionId);
    }),
    command: vi.fn(async (command: AgentCommand) => {
      commands.push(command);
      if (command.type === "delete") live.delete(command.sessionId);
      if (command.type === "read-trace") return live.has(command.sessionId) ? [] : trace;
      if (command.type !== "submit" || outcome === "never") return;
      const { sessionId, submission } = command;
      for (const { name, args } of toolCalls) {
        const host = hosts.get(sessionId);
        if (!host) throw new Error(`No tool host for ${sessionId}.`);
        toolResults.push(
          await host(
            {
              type: "tool",
              callId: "c",
              sessionId,
              runId: submission.id,
              name,
              args,
            } as Parameters<ToolHost>[0],
            new AbortController().signal,
          ),
        );
      }
      queueMicrotask(() => {
        snapshots.set(sessionId, {
          ...emptySessionSnapshot(sessionId),
          acceptedSubmissionIds: [submission.id],
          outcome,
          error: outcome === "failed" ? "Provider refused." : undefined,
          messages: [
            submission.message,
            {
              id: "a1",
              role: "assistant",
              content: ANSWER,
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            },
          ],
        });
        listeners.get(sessionId)?.();
      });
    }),
  };
};

const create = (runtime: ReturnType<typeof fakeRuntime>) =>
  createWebAgentAdapter({
    provider: {
      id: "p1",
      name: "Provider",
      baseUrl: "https://example.test",
      apiFormat: "chat-completions",
      models: [],
      selectedModelId: "model-a",
    },
    config: { maxIterations: 20, compaction: true },
    tools: createChatTools({ query: () => [] }),
    runtime,
  });

const question = { questionId: "q01", question: "What is word2vec?" };

describe("citationsFrom", () => {
  it("takes citations only from memora-jump tags", () => {
    expect(citationsFrom(ANSWER)).toEqual([
      { fileId: "eval-abc-lec11", startSec: 12, endSec: 18.5 },
    ]);
    expect(citationsFrom("At 3:10 the lecture says so.")).toEqual([]);
  });
});

describe("createWebAgentAdapter", () => {
  it("answers in a fresh in-memory session with only the read-only tools, then deletes it", async () => {
    const runtime = fakeRuntime("completed");
    const adapter = await create(runtime);

    const answer = await adapter.answer(question, new AbortController().signal);

    const submit = runtime.commands.find((command) => command.type === "submit");
    if (submit?.type !== "submit") throw new Error("No submission.");
    expect(submit.sessionId).toMatch(/^eval-/);
    expect(submit.storage).toBe("memory");
    expect(runtime.subscribe).toHaveBeenCalledWith(
      submit.sessionId,
      expect.any(Function),
      "memory",
    );
    expect(submit.submission.tools.map((tool) => tool.name).sort()).toEqual(
      [...EVALUATION_TOOL_NAMES].sort(),
    );
    expect(submit.submission.input.content).toEqual([{ type: "text", text: question.question }]);
    expect(answer).toEqual({
      answer: ANSWER,
      citations: [{ fileId: "eval-abc-lec11", startSec: 12, endSec: 18.5 }],
      sessionId: submit.sessionId,
      runId: submit.submission.id,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      fallbackTrims: "unknown",
    });
    expect(runtime.live.size).toBe(0);
    expect(adapter.identity).toMatchObject({
      adapter: "memora-web",
      model: "model-a",
      tools: [...EVALUATION_TOOL_NAMES],
      settings: { personality: "none", notices: "none" },
    });
    expect(adapter.identity.promptRevision).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    [
      "counts fallback trims",
      [
        event("run.started"),
        event("context.trimmed"),
        event("context.trimmed"),
        event("run.settled"),
      ],
      2,
    ],
    ["records zero trims", [event("run.started"), event("run.settled")], 0],
    [
      "records unknown without run.settled",
      [event("run.started"), event("context.trimmed")],
      "unknown",
    ],
  ] as const)("%s from the deleted session's Trace", async (_name, trace, expected) => {
    const runtime = fakeRuntime("completed", [...trace]);
    const adapter = await create(runtime);

    const answer = await adapter.answer(question, new AbortController().signal);

    expect(answer.fallbackTrims).toBe(expected);
    expect(runtime.commands.at(-1)).toEqual({
      type: "read-trace",
      sessionId: answer.sessionId,
      runId: answer.runId,
    });
  });

  it("sums tokens over every model call in the Trace, summaries included", async () => {
    // Prompt-cache hits appear only in the total, beside the uncached input.
    const response = (purpose: string, inputTokens: number, outputTokens: number, cached = 0) => ({
      ...event("model.response"),
      purpose,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens + cached },
    });
    const runtime = fakeRuntime("completed", [
      event("run.started"),
      response("reply", 100, 10),
      response("summary", 40, 20),
      response("reply", 300, 5, 1_900),
      event("run.settled"),
    ]);
    const adapter = await create(runtime);

    const answer = await adapter.answer(question, new AbortController().signal);

    expect(answer.tokens).toEqual({ input: 440, cached: 1_900, output: 35 });
  });

  it("deletes the session when the Run fails and reports its Trace with the error", async () => {
    const runtime = fakeRuntime("failed", [
      event("run.started"),
      event("context.trimmed"),
      { ...event("model.response"), usage: { inputTokens: 30, outputTokens: 2 } },
      event("run.settled"),
    ]);
    const adapter = await create(runtime);

    const error = await adapter.answer(question, new AbortController().signal).catch((e) => e);

    expect(error).toBeInstanceOf(AgentAttemptError);
    expect(error.message).toBe("Provider refused.");
    const submit = runtime.commands.find((command) => command.type === "submit");
    if (submit?.type !== "submit") throw new Error("No submission.");
    expect(error.trace).toEqual({
      sessionId: submit.sessionId,
      runId: submit.submission.id,
      fallbackTrims: 1,
      tokens: { input: 30, cached: 0, output: 2 },
    });
    expect(runtime.live.size).toBe(0);
  });

  it("deletes the in-flight session when canceled", async () => {
    const runtime = fakeRuntime("never");
    const adapter = await create(runtime);
    const controller = new AbortController();

    const pending = adapter.answer(question, controller.signal);
    await vi.waitFor(() => expect(runtime.live.size).toBe(1));
    controller.abort(new DOMException("Canceled.", "AbortError"));

    await expect(pending).rejects.toThrow("Canceled.");
    // A Trace cut short has no run.settled; it can still be opened.
    await expect(pending).rejects.toMatchObject({
      trace: { sessionId: expect.stringMatching(/^eval-/), fallbackTrims: "unknown" },
    });
    expect(runtime.live.size).toBe(0);
  });

  it("sends a question's notices as the session's stored preferences", async () => {
    const runtime = fakeRuntime("completed");
    const adapter = await create(runtime);

    await adapter.answer(
      { ...question, notices: ["User prefers answers in Chinese."] },
      new AbortController().signal,
    );

    const submit = runtime.commands.find((command) => command.type === "submit");
    if (submit?.type !== "submit") throw new Error("No submission.");
    expect(submit.submission.memory).toEqual({ notices: ["User prefers answers in Chinese."] });
  });
});

describe("createWebMemoryAdapter", () => {
  const sessions = [
    {
      sessionId: "past-1",
      title: "Batch size",
      updatedAt: "2026-09-01T10:00:00.000Z",
      messages: [{ role: "user" as const, content: "Let's use 512." }],
    },
  ];

  it("runs tool calls against the fixture chats and keeps changed notices with the attempt", async () => {
    const runtime = fakeRuntime(
      "completed",
      [],
      [
        { name: "list_chat_sessions", args: {} },
        { name: "read_chat_session", args: { session_id: "past-1" } },
        {
          name: "remember_user_preference",
          args: {
            user_request: "Answer in Chinese from now on.",
            assistant_reply: "OK.",
            reason: "r",
          },
        },
      ],
    );
    const adapter = await createWebMemoryAdapter({
      provider: {
        id: "p1",
        name: "Provider",
        baseUrl: "https://example.test",
        apiFormat: "chat-completions",
        models: [],
        selectedModelId: "model-a",
      },
      config: { maxIterations: 20 },
      sessions,
      runtime,
      createTools: (standIns) =>
        createChatTools({ query: () => [] }, standIns).map((tool) =>
          tool.name === "remember_user_preference"
            ? {
                ...tool,
                execute: async () => {
                  const [saved] = await standIns.memoryNotices.list();
                  return standIns.memoryNotices.apply({
                    add: [],
                    replace: [{ id: saved.id, text: "User prefers Chinese." }],
                    remove: [],
                  });
                },
              }
            : tool,
        ),
    });

    const reply = await adapter.converse(
      {
        caseId: "r1",
        message: "What batch size did we pick?",
        notices: ["User prefers English."],
      },
      new AbortController().signal,
    );

    expect(adapter.identity.tools.sort()).toEqual([...MEMORY_EVALUATION_TOOL_NAMES].sort());
    expect(reply.toolCalls.map(({ name }) => name)).toEqual([
      "list_chat_sessions",
      "read_chat_session",
      "remember_user_preference",
    ]);
    expect(runtime.toolResults[0]).toMatchObject([{ id: "past-1", title: "Batch size" }]);
    expect(runtime.toolResults[1]).toMatchObject({
      id: "past-1",
      messages: [{ role: "user", content: "Let's use 512." }],
    });
    expect(reply.notices).toEqual(["User prefers Chinese."]);
    const submit = runtime.commands.find((command) => command.type === "submit");
    if (submit?.type !== "submit") throw new Error("No submission.");
    expect(submit.submission.memory).toEqual({ notices: ["User prefers English."] });
    expect(runtime.hosts.size).toBe(0);
  });
});
