import { describe, expect, it, vi } from "vite-plus/test";

import type { AgentCommand, SessionSnapshot } from "@/lib/agent-runtime/protocol";
import { emptySessionSnapshot } from "@/lib/agent-runtime/sessionRuntime";
import { createChatTools } from "@/lib/chat/tools";
import {
  citationsFrom,
  createWebAgentAdapter,
  EVALUATION_TOOL_NAMES,
} from "@/lib/playground/agentEvaluationAdapter";

const ANSWER =
  'Word2vec is covered here <memora-jump fileId="eval-abc-lec11" fileName="Lecture 11" mediaType="video" startSec="12" endSec="18.5" context="x" /> and in prose at 3:10.';

type Outcome = "completed" | "failed" | "never";

/** Stands in for the agent runtime client; finishes each submission with the given outcome. */
const fakeRuntime = (outcome: Outcome) => {
  const snapshots = new Map<string, SessionSnapshot>();
  const listeners = new Map<string, () => void>();
  const commands: AgentCommand[] = [];
  const live = new Set<string>();
  return {
    commands,
    live,
    getSnapshot: (sessionId: string) => snapshots.get(sessionId) ?? emptySessionSnapshot(sessionId),
    subscribe: vi.fn((sessionId: string, listener: () => void, _storage?: "memory") => {
      listeners.set(sessionId, listener);
      live.add(sessionId);
      return () => listeners.delete(sessionId);
    }),
    command: vi.fn(async (command: AgentCommand) => {
      commands.push(command);
      if (command.type === "delete") live.delete(command.sessionId);
      if (command.type !== "submit" || outcome === "never") return;
      const { sessionId, submission } = command;
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

  it("deletes the session when the Run fails", async () => {
    const runtime = fakeRuntime("failed");
    const adapter = await create(runtime);

    await expect(adapter.answer(question, new AbortController().signal)).rejects.toThrow(
      "Provider refused.",
    );
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
    expect(runtime.live.size).toBe(0);
  });
});
