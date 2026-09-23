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
    h.releases.get("a")?.();
    await vi.waitFor(() => expect(h.calls).toEqual(["a", "b"]));
    h.releases.get("b")?.();
    await vi.waitFor(() => expect(h.runtime.snapshot.activeRunId).toBeUndefined());
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
