import { describe, expect, it, vi } from "vite-plus/test";
import type { AgentEvent, AgentMessage } from "@memora/ai-core";
import {
  SessionRuntime,
  emptySessionSnapshot,
  type SessionRunner,
} from "@/lib/agent-runtime/sessionRuntime";
import type { AgentSubmission, SessionSnapshot } from "@/lib/agent-runtime/protocol";

const submission = (id: string, mode: "pending" | "steer" = "pending"): AgentSubmission => ({
  id,
  mode,
  input: { id, role: "user", createdAt: 1, content: [{ type: "text", text: id }] },
  message: { id, role: "user", content: id },
  config: { id: "agent" },
  provider: {
    id: "test",
    name: "Test",
    baseUrl: "https://example.test",
    apiFormat: "responses",
    models: [],
    selectedModelId: "test",
  },
  prompts: [],
  tools: [],
  scope: {
    isActive: false,
    fileIds: [],
    allowedPaths: [],
    referenceLabels: [],
    totalResolvedFiles: 0,
    truncated: false,
  },
});

function harness(sessionId = "session") {
  const calls: string[] = [];
  const steering: string[] = [];
  const releases = new Map<string, (fail?: boolean) => void>();
  const saved: SessionSnapshot[] = [];
  const runtime = new SessionRuntime({
    snapshot: emptySessionSnapshot(sessionId),
    publish: () => {},
    save: async (snapshot) => {
      saved.push(snapshot);
    },
    createRunner: async (item): Promise<SessionRunner> => {
      let started = false;
      let ended = false;
      let fail = false;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const inputs: AgentMessage[] = [];
      return {
        async *run() {
          started = true;
          calls.push(item.id);
          releases.set(item.id, (failed) => {
            fail = Boolean(failed);
            release();
          });
          yield { type: "text-delta", delta: "partial" } as AgentEvent;
          await gate;
          ended = true;
          if (fail) throw new Error("provider failed");
        },
        steer: (message) => {
          if (!started || ended) return false;
          inputs.push(message);
          steering.push(message.id);
          return true;
        },
        abort: () => {
          ended = true;
          release();
        },
        takeUnconsumedSteering: () => [],
      };
    },
  });
  return { runtime, calls, steering, releases, saved };
}

describe("session execution", () => {
  it("runs sessions concurrently while pending work remains serial within each session", async () => {
    const a = harness("a");
    const b = harness("b");
    await Promise.all([a.runtime.submit(submission("a1")), b.runtime.submit(submission("b1"))]);
    await vi.waitFor(() => {
      expect(a.calls).toEqual(["a1"]);
      expect(b.calls).toEqual(["b1"]);
    });
    await a.runtime.submit(submission("a2"));
    expect(a.calls).toEqual(["a1"]);
    a.releases.get("a1")?.();
    await vi.waitFor(() => expect(a.calls).toEqual(["a1", "a2"]));
    a.releases.get("a2")?.();
    b.releases.get("b1")?.();
    await vi.waitFor(() => {
      expect(a.runtime.snapshot.activeRunId).toBeUndefined();
      expect(b.runtime.snapshot.activeRunId).toBeUndefined();
    });
  });

  it("steering bypasses pending messages without losing either ordering", async () => {
    const h = harness();
    await h.runtime.submit(submission("a"));
    await vi.waitFor(() => expect(h.calls).toEqual(["a"]));
    await h.runtime.submit(submission("b"));
    await h.runtime.submit(submission("c", "steer"));
    await h.runtime.submit(submission("d", "steer"));
    expect(h.steering).toEqual(["c", "d"]);
    expect(h.runtime.snapshot.pending.map((item) => item.id)).toEqual(["b"]);
    // Until the model reads them, steers follow the reply they were sent during.
    expect(h.runtime.snapshot.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "user",
    ]);
    h.releases.get("a")?.();
    await vi.waitFor(() => expect(h.calls).toEqual(["a", "b"]));
    h.releases.get("b")?.();
    await vi.waitFor(() => expect(h.runtime.snapshot.activeRunId).toBeUndefined());
  });

  it("steers a queued message into the running task", async () => {
    const h = harness();
    await h.runtime.submit(submission("a"));
    await vi.waitFor(() => expect(h.calls).toEqual(["a"]));
    await h.runtime.submit(submission("b"));
    expect(await h.runtime.steerPending("b")).toBe(true);
    expect(h.steering).toEqual(["b"]);
    expect(h.runtime.snapshot.pending).toEqual([]);
    expect(h.runtime.snapshot.messages.at(-1)?.id).toBe("b");
    h.releases.get("a")?.();
    await vi.waitFor(() => expect(h.runtime.snapshot.activeRunId).toBeUndefined());
    // It ran inside "a", not as its own task.
    expect(h.calls).toEqual(["a"]);
  });

  it.each([
    ["ends the reply at a steer and answers it in a new reply", "one", ["a", "one", "c", "two"]],
    ["moves a reply with nothing in it below the steer", "", ["a", "c", "two"]],
  ])("%s", async (_name, before, expected) => {
    let consume: () => void = () => {};
    const read = new Promise<void>((resolve) => {
      consume = resolve;
    });
    const runtime = new SessionRuntime({
      snapshot: emptySessionSnapshot("steer"),
      publish: () => {},
      save: async () => {},
      createRunner: async (): Promise<SessionRunner> => ({
        async *run() {
          if (before) yield { type: "text-delta", delta: before } as AgentEvent;
          await read;
          yield { type: "steer-consumed", messageIds: ["c"] } as AgentEvent;
          yield { type: "text-delta", delta: "two" } as AgentEvent;
        },
        steer: () => true,
        abort: () => {},
        takeUnconsumedSteering: () => [],
      }),
    });
    await runtime.submit(submission("a"));
    await vi.waitFor(() => expect(runtime.snapshot.activeRunId).toBe("a"));
    await runtime.submit(submission("c", "steer"));
    consume();
    await vi.waitFor(() => expect(runtime.snapshot.activeRunId).toBeUndefined());
    expect(
      runtime.snapshot.messages.map((message) =>
        message.role === "user" ? message.id : message.content,
      ),
    ).toEqual(expected);
  });

  it.each(["stop", "failure"])(
    "continues pending after %s and ignores a stale stop",
    async (reason) => {
      const h = harness();
      await h.runtime.submit(submission("a"));
      await vi.waitFor(() => expect(h.calls).toEqual(["a"]));
      await h.runtime.submit(submission("b"));
      if (reason === "stop") h.runtime.abort("a");
      else h.releases.get("a")?.(true);
      await vi.waitFor(() => expect(h.calls).toEqual(["a", "b"]));
      h.runtime.abort("a");
      expect(h.runtime.snapshot.activeRunId).toBe("b");
      expect(
        h.saved.some((snapshot) => snapshot.outcome === (reason === "stop" ? "aborted" : "failed")),
      ).toBe(true);
      h.releases.get("b")?.();
      await vi.waitFor(() => expect(h.runtime.snapshot.activeRunId).toBeUndefined());
    },
  );

  it("starts a late steer as ordinary work when the previous run has ended", async () => {
    const h = harness();
    await h.runtime.submit(submission("a"));
    await vi.waitFor(() => expect(h.calls).toEqual(["a"]));
    h.releases.get("a")?.();
    await vi.waitFor(() => expect(h.runtime.snapshot.activeRunId).toBeUndefined());
    await h.runtime.submit(submission("b", "steer"));
    await vi.waitFor(() => expect(h.calls).toEqual(["a", "b"]));
    await h.runtime.submit(submission("b", "steer"));
    expect(h.steering).toEqual([]);
    expect(h.runtime.snapshot.pending).toEqual([]);
    h.releases.get("b")?.();
    await vi.waitFor(() => expect(h.runtime.snapshot.activeRunId).toBeUndefined());
  });

  it("keeps submission receipts across a runtime reload", async () => {
    const h = harness();
    await h.runtime.submit(submission("a"));
    await vi.waitFor(() => expect(h.calls).toEqual(["a"]));
    const persisted = h.saved.at(-1);
    expect(persisted?.acceptedSubmissionIds).toEqual(["a"]);
    if (!persisted) throw new Error("Missing persisted receipt");
    const reloaded = new SessionRuntime({
      snapshot: persisted,
      publish: () => {},
      save: async () => {},
      createRunner: async () => {
        throw new Error("Duplicate submission started another run");
      },
    });
    await reloaded.submit(submission("a"));
    expect(reloaded.snapshot.revision).toBe(persisted.revision);
    h.releases.get("a")?.();
    await vi.waitFor(() => expect(h.runtime.snapshot.activeRunId).toBeUndefined());
  });

  it("deleting a running session drops its queue and waits for execution to stop", async () => {
    const h = harness();
    await h.runtime.submit(submission("a"));
    await vi.waitFor(() => expect(h.calls).toEqual(["a"]));
    await h.runtime.submit(submission("b"));
    await h.runtime.stopAll();
    expect(h.calls).toEqual(["a"]);
    expect(h.runtime.snapshot.pending).toEqual([]);
    expect(h.runtime.snapshot.activeRunId).toBeUndefined();
  });
});

describe("SessionRuntime stream publishing", () => {
  it("coalesces per-token events into one snapshot and still publishes the final state", async () => {
    vi.useFakeTimers();
    const published: SessionSnapshot[] = [];
    let release: () => void = () => {};
    const runtime = new SessionRuntime({
      snapshot: emptySessionSnapshot("session"),
      publish: (snapshot) => published.push(snapshot),
      save: async () => {},
      createRunner: async (): Promise<SessionRunner> => ({
        async *run() {
          for (const delta of ["a", "b", "c"]) yield { type: "text-delta", delta } as AgentEvent;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        },
        steer: () => false,
        abort: () => {},
        takeUnconsumedSteering: () => [],
      }),
    });

    await runtime.submit(submission("one"));
    await vi.advanceTimersByTimeAsync(0);
    const beforeFlush = published.length;
    await vi.advanceTimersByTimeAsync(50);
    expect(published.length).toBe(beforeFlush + 1);
    expect(published.at(-1)?.messages.at(-1)?.content).toBe("abc");

    release();
    await vi.runAllTimersAsync();
    expect(published.at(-1)?.activeRunId).toBeUndefined();
    vi.useRealTimers();
  });
});
