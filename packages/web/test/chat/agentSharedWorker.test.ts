import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  AgentRequest,
  AgentCommand,
  AgentResponse,
  AgentSubmission,
} from "@/lib/agent-runtime/protocol";
import type { ChatSessionRecord } from "@/lib/chat/chatSessionStorage";
import type { TraceEvent } from "@/lib/agent-runtime/traceRecorder";

const state = vi.hoisted(() => ({
  records: new Map<string, ChatSessionRecord>(),
  gates: new Map<string, () => void>(),
  calls: [] as string[],
  touched: [] as string[],
  traces: new Map<string, string>(),
  failAppends: 0,
}));
vi.mock("@/lib/chat/traceStorage", () => ({
  appendTrace: async (sessionId: string, runId: string, text: string) => {
    if (state.failAppends > 0) {
      state.failAppends -= 1;
      throw new Error("disk full");
    }
    const key = `${sessionId}/${runId}`;
    state.traces.set(key, (state.traces.get(key) ?? "") + text);
  },
  listTraceRuns: async (sessionId: string) =>
    [...state.traces.keys()]
      .filter((key) => key.startsWith(`${sessionId}/`))
      .map((key) => key.slice(sessionId.length + 1)),
  readTraceText: async (sessionId: string, runId: string) => {
    const text = state.traces.get(`${sessionId}/${runId}`);
    if (text === undefined) throw new Error("missing trace");
    return text;
  },
  deleteSessionTraces: async (sessionId: string) => {
    for (const key of state.traces.keys())
      if (key.startsWith(`${sessionId}/`)) state.traces.delete(key);
  },
  clearTraces: async () => state.traces.clear(),
}));
vi.mock("@/lib/chat/chatSessionStorage", () => ({
  loadChatSession: async (id: string) => {
    state.touched.push(id);
    return structuredClone(state.records.get(id) ?? null);
  },
  updateChatSession: async (
    id: string,
    update: (record: ChatSessionRecord) => ChatSessionRecord,
  ) => {
    state.touched.push(id);
    const previous = state.records.get(id) ?? {
      id,
      schemaVersion: 2,
      title: "New session",
      createdAt: 1,
      updatedAt: 1,
      messages: [],
      references: [],
      agentStore: {},
    };
    const record = update(structuredClone(previous));
    state.records.set(id, structuredClone(record));
    return record;
  },
  deleteChatSession: async (id: string) => {
    state.touched.push(id);
    state.records.delete(id);
  },
}));
vi.mock("@/lib/chat/opfsSessionPersistenceAdapter", async () => {
  const { createInMemoryAdapter } = await import("@memora/ai-core");
  const adapters = new Map();
  return {
    createOpfsSessionPersistenceAdapter: (id: string) => {
      if (!adapters.has(id)) adapters.set(id, createInMemoryAdapter());
      return adapters.get(id);
    },
  };
});
vi.mock("@memora/ai-provider-pi", () => ({
  createRemotePiRuntime: () => ({
    model: {
      id: "fake",
      name: "Fake",
      api: "fake",
      provider: "fake",
      baseUrl: "",
      contextWindow: 1024,
      maxTokens: 128,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
    stream: (
      _model: unknown,
      context: { messages: Array<{ role: string; content: string }> },
      options: { signal?: AbortSignal },
    ) =>
      (async function* () {
        const input =
          context.messages.findLast((message) => message.role === "user")?.content ?? "";
        state.calls.push(input);
        if (input === "tool" && context.messages.at(-1)?.role !== "toolResult") {
          yield {
            type: "toolcall_end",
            toolCall: { id: "tool-1", name: "read_file", arguments: { path: "/files/test" } },
          };
          return;
        }
        yield { type: "text_delta", delta: `answer:${input}` };
        if (input.startsWith("hold")) {
          await new Promise<void>((resolve) => {
            const finish = () => {
              options.signal?.removeEventListener("abort", finish);
              resolve();
            };
            state.gates.set(input, finish);
            if (options.signal?.aborted) finish();
            else options.signal?.addEventListener("abort", finish, { once: true });
          });
        }
      })(),
  }),
}));

class Port {
  onmessage: ((event: MessageEvent<AgentRequest>) => void) | null = null;
  messages: AgentResponse[] = [];
  postMessage(message: AgentResponse) {
    this.messages.push(structuredClone(message));
  }
  start() {}
  async request(command: AgentCommand) {
    const requestId = crypto.randomUUID();
    this.onmessage?.({ data: { ...command, requestId } } as MessageEvent<AgentRequest>);
    await vi.waitFor(() =>
      expect(
        this.messages.some(
          (message) => message.type === "reply" && message.requestId === requestId,
        ),
      ).toBe(true),
    );
    const reply = this.messages.find(
      (message) => message.type === "reply" && message.requestId === requestId,
    );
    if (reply?.type === "reply" && reply.error) throw new Error(reply.error);
    return reply?.type === "reply" ? reply.result : undefined;
  }
  snapshot() {
    return this.messages.filter((message) => message.type === "snapshot").at(-1)?.snapshot;
  }
}
const submission = (text: string): AgentSubmission => ({
  id: crypto.randomUUID(),
  mode: "pending",
  message: { id: text, role: "user", content: text },
  input: { id: text, role: "user", content: [{ type: "text", text }], createdAt: 1 },
  config: { id: "test" },
  provider: {
    id: "fake",
    name: "Fake",
    apiFormat: "responses",
    baseUrl: "https://example.test",
    selectedModelId: "fake",
    models: [],
  },
  prompts: [],
  tools: [{ name: "read_file", description: "Read", parameters: { type: "object" } }],
  scope: {
    isActive: false,
    fileIds: [],
    allowedPaths: [],
    referenceLabels: [],
    totalResolvedFiles: 0,
    truncated: false,
  },
});
let connect: () => Port;
// The first import transforms a large module graph; keep that cost out of each test's budget.
const COLD_IMPORT_TIMEOUT = 60_000;

// Warms the transform cache so the per-test re-import after resetModules only re-evaluates.
beforeAll(async () => {
  vi.stubGlobal("self", {});
  await import("@/workers/agent.shared-worker");
  vi.unstubAllGlobals();
}, COLD_IMPORT_TIMEOUT);
// Re-evaluating the module gives a fresh worker with empty in-memory state, like a browser restart.
const startWorker = async (): Promise<void> => {
  vi.resetModules();
  const scope: { onconnect?: (event: MessageEvent) => void } = {};
  vi.stubGlobal("self", scope);
  await import("@/workers/agent.shared-worker");
  connect = () => {
    const port = new Port();
    scope.onconnect?.({ ports: [port] } as unknown as MessageEvent);
    return port;
  };
};
beforeEach(async () => {
  state.records.clear();
  state.calls = [];
  state.touched = [];
  state.gates.clear();
  state.traces.clear();
  state.failAppends = 0;
  await startWorker();
});
afterEach(() => {
  for (const finish of state.gates.values()) finish();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("agent SharedWorker protocol", () => {
  it("checkpoints the active run when the last page leaves and lets a new page reattach", async () => {
    const leaving = connect();
    await leaving.request({ type: "host-ready" });
    await leaving.request({ type: "subscribe", sessionId: "reattach" });
    await leaving.request({
      type: "submit",
      sessionId: "reattach",
      submission: submission("hold-reattach"),
    });
    await vi.waitFor(() => expect(state.gates.has("hold-reattach")).toBe(true));
    const runId = leaving.snapshot()?.activeRunId;
    expect(runId).toBeDefined();
    await leaving.request({ type: "disconnect" });
    expect(
      (state.records.get("reattach")?.agentStore.runtime?.snapshot as { activeRunId?: string })
        ?.activeRunId,
    ).toBe(runId);
    const returned = connect();
    await returned.request({ type: "subscribe", sessionId: "reattach" });
    expect(returned.snapshot()?.activeRunId).toBe(runId);
    state.gates.get("hold-reattach")?.();
    await vi.waitFor(() => expect(returned.snapshot()?.outcome).toBe("completed"));
  });

  it("keeps an experiment session in memory and forwards memory notifications to subscribers", async () => {
    const first = connect();
    const second = connect();
    await first.request({ type: "subscribe", sessionId: "experiment", storage: "memory" });
    await second.request({ type: "subscribe", sessionId: "experiment", storage: "memory" });
    await first.request({
      type: "submit",
      sessionId: "experiment",
      storage: "memory",
      submission: submission("question"),
    });
    await vi.waitFor(() => expect(first.snapshot()?.outcome).toBe("completed"));
    expect(state.records.has("experiment")).toBe(false);
    await first.request({ type: "memory-updated", sessionId: "experiment" });
    expect(second.messages.some((message) => message.type === "memory-updated")).toBe(true);
  });

  it("keeps every in-memory session command off chat-session storage after a worker restart", async () => {
    const before = connect();
    await before.request({ type: "subscribe", sessionId: "attempt", storage: "memory" });
    await before.request({
      type: "submit",
      sessionId: "attempt",
      storage: "memory",
      submission: submission("question"),
    });
    await vi.waitFor(() => expect(before.snapshot()?.outcome).toBe("completed"));
    const commands: AgentCommand[] = [
      { type: "abort", sessionId: "attempt", runId: "gone", storage: "memory" },
      { type: "reset", sessionId: "attempt", messages: [], history: [], storage: "memory" },
      {
        type: "patch-message",
        sessionId: "attempt",
        message: { id: "question", role: "user", content: "edited" },
        storage: "memory",
      },
      { type: "steer-pending", sessionId: "attempt", submissionId: "gone", storage: "memory" },
      {
        type: "approval",
        sessionId: "attempt",
        approvalId: "gone",
        decision: "deny",
        storage: "memory",
      },
      { type: "delete", sessionId: "attempt", storage: "memory" },
    ];
    for (const command of commands) {
      await startWorker();
      await connect().request(command);
    }
    expect(state.touched).toEqual([]);
  });

  it("keeps one session running across subscribers and runs another session concurrently", async () => {
    const a = connect();
    const b = connect();
    await a.request({ type: "subscribe", sessionId: "a" });
    await a.request({ type: "submit", sessionId: "a", submission: submission("hold-a") });
    await vi.waitFor(() => {
      expect(a.snapshot()?.error).toBeUndefined();
      expect(state.gates.has("hold-a")).toBe(true);
    });
    await b.request({ type: "subscribe", sessionId: "a" });
    expect(b.snapshot()?.messages.at(-1)?.content).toBe("answer:hold-a");
    await a.request({ type: "unsubscribe", sessionId: "a" });
    await a.request({ type: "subscribe", sessionId: "b" });
    await a.request({ type: "submit", sessionId: "b", submission: submission("b") });
    await vi.waitFor(() => expect(a.snapshot()?.outcome).toBe("completed"));
    expect(b.snapshot()?.activeRunId).toBeDefined();
    state.gates.get("hold-a")?.();
    await vi.waitFor(() => expect(b.snapshot()?.outcome).toBe("completed"));
  });

  it("runs tools in the tab that submitted, not the first tab that connected", async () => {
    const first = connect();
    const second = connect();
    await first.request({ type: "host-ready" });
    await second.request({ type: "host-ready" });
    await second.request({ type: "subscribe", sessionId: "s" });
    await second.request({ type: "submit", sessionId: "s", submission: submission("tool") });
    await vi.waitFor(() =>
      expect(second.messages.some((message) => message.type === "tool")).toBe(true),
    );
    expect(first.messages.some((message) => message.type === "tool")).toBe(false);
  });

  it("routes tools through another connected workspace after the first disconnects", async () => {
    const first = connect();
    const second = connect();
    await first.request({ type: "host-ready" });
    await second.request({ type: "host-ready" });
    await first.request({ type: "disconnect" });
    await second.request({ type: "subscribe", sessionId: "s" });
    await second.request({ type: "submit", sessionId: "s", submission: submission("tool") });
    await vi.waitFor(() =>
      expect(second.messages.some((message) => message.type === "tool")).toBe(true),
    );
    const call = second.messages.find((message) => message.type === "tool");
    if (call?.type !== "tool") throw new Error("missing tool call");
    await second.request({
      type: "request-approval",
      callId: call.callId,
      request: {
        path: "/files/test",
        operation: "write",
        content: "x",
        contentLength: 1,
        overwrite: false,
      },
    });
    const approval = second.snapshot()?.approval;
    expect(approval).toBeDefined();
    await second.request({
      type: "approval",
      sessionId: "s",
      approvalId: approval!.id,
      decision: "allow_once",
    });
    expect(
      second.messages.some(
        (message) => message.type === "approval-result" && message.decision === "allow_once",
      ),
    ).toBe(true);
    await second.request({ type: "tool-result", callId: call.callId, result: "data" });
    await vi.waitFor(() => expect(second.snapshot()?.outcome).toBe("completed"));
  });

  it("keeps tool calls and results before a resent message and falls back without a match", async () => {
    const text = (id: string, role: "user" | "assistant", value: string) => ({
      id,
      role,
      content: [{ type: "text" as const, text: value }],
      createdAt: 1,
    });
    const earlier = [
      text("first", "user", "first"),
      {
        id: "call",
        role: "assistant" as const,
        content: [{ type: "tool_call" as const, id: "t1", name: "read_file", arguments: {} }],
        createdAt: 1,
      },
      {
        id: "result",
        role: "tool" as const,
        content: [{ type: "tool_result" as const, id: "t1", name: "read_file", result: "data" }],
        createdAt: 1,
      },
      text("answer", "assistant", "answer"),
    ];
    const rebuilt = [text("first", "user", "first"), text("answer", "assistant", "answer")];
    state.records.set("replay", {
      id: "replay",
      schemaVersion: 2,
      title: "Saved",
      createdAt: 1,
      updatedAt: 1,
      messages: [],
      references: [],
      agentStore: {
        "memora-chat:replay": {
          history: [...earlier, text("second", "user", "second"), text("reply", "assistant", "x")],
          compaction: { compactedThrough: "call", strippedThrough: "reply" },
        },
      },
    });
    const port = connect();
    await port.request({ type: "subscribe", sessionId: "replay" });
    const history = () => state.records.get("replay")?.agentStore["memora-chat:replay"]?.history;

    await port.request({
      type: "reset",
      sessionId: "replay",
      messages: [],
      history: rebuilt,
      replayFrom: "second",
    });
    expect(history()).toEqual(earlier);
    // The cut removed the stripped-through message, so every kept message was sent stripped.
    expect(state.records.get("replay")?.agentStore["memora-chat:replay"]?.compaction).toEqual({
      compactedThrough: "call",
      strippedThrough: "answer",
    });

    await port.request({
      type: "reset",
      sessionId: "replay",
      messages: [],
      history: rebuilt,
      replayFrom: "missing",
    });
    expect(history()).toEqual(rebuilt);
  });

  it("retains interrupted and queued messages after a worker restart without resuming them", async () => {
    const pending = submission("queued");
    state.records.set("recover", {
      id: "recover",
      schemaVersion: 2,
      title: "Saved",
      createdAt: 1,
      updatedAt: 1,
      messages: [{ id: "partial", role: "assistant", content: "partial answer" }],
      references: [],
      agentStore: {
        runtime: {
          snapshot: {
            sessionId: "recover",
            revision: 4,
            messages: [],
            activeRunId: "old",
            pending: [{ id: pending.id, text: "queued", message: pending.message }],
            status: { type: "thinking" },
            thinkingSteps: [],
            thinkingCollapsed: false,
          },
        },
      },
    });
    const port = connect();
    await port.request({ type: "subscribe", sessionId: "recover" });
    expect(port.snapshot()?.outcome).toBe("interrupted");
    expect(port.snapshot()?.messages.map((message) => message.content)).toEqual([
      "partial answer",
      "queued",
    ]);
    expect(port.snapshot()?.activeRunId).toBeUndefined();
    expect(state.calls).toEqual([]);
  });
});

describe("agent SharedWorker Traces", () => {
  const run = async (port: Port, sessionId: string, text: string, storage?: "memory") => {
    const item = submission(text);
    await port.request({ type: "submit", sessionId, submission: item, storage });
    await vi.waitFor(() => {
      const snapshot = port.snapshot();
      expect(snapshot?.activeRunId).toBeUndefined();
      expect(snapshot?.outcome).toBeDefined();
    });
    // run.settled is written before the session reports idle; wait for its append.
    await vi.waitFor(() =>
      expect(state.traces.get(`${sessionId}/${item.id}`)).toContain('"run.settled"'),
    );
    return item.id;
  };
  const answerTool = async (port: Port) => {
    await vi.waitFor(() =>
      expect(port.messages.some((message) => message.type === "tool")).toBe(true),
    );
    const call = port.messages.find((message) => message.type === "tool");
    if (call?.type !== "tool") throw new Error("missing tool call");
    await port.request({ type: "tool-result", callId: call.callId, result: "data" });
  };
  const read = async (port: Port, sessionId: string, runId: string) =>
    (await port.request({ type: "read-trace", sessionId, runId })) as TraceEvent[];

  it("records one Trace per Run with envelope fields and increasing sequence", async () => {
    const port = connect();
    await port.request({ type: "host-ready" });
    await port.request({ type: "subscribe", sessionId: "traced" });
    const first = run(port, "traced", "tool");
    await answerTool(port);
    const firstId = await first;
    const secondId = await run(port, "traced", "again");

    expect(
      ((await port.request({ type: "list-runs", sessionId: "traced" })) as string[]).sort(),
    ).toEqual([firstId, secondId].sort());
    const events = await read(port, "traced", firstId);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));
    for (const event of events) {
      expect(event).toMatchObject({ formatVersion: 1, sessionId: "traced", runId: firstId });
      expect(typeof event.timestamp).toBe("number");
    }
    expect(events[0]).toMatchObject({
      type: "run.started",
      submissionId: firstId,
      submission: { submissionId: firstId, mode: "pending", input: { id: "tool" } },
      appVersion: __APP_VERSION__,
      history: [],
    });
    expect(events[0]?.compactionParameters).toBeDefined();
    expect(events.find((event) => event.type === "tool.settled")).toMatchObject({
      name: "read_file",
      outcome: "known",
    });
    const settled = events.at(-1);
    expect(settled).toMatchObject({ type: "run.settled", outcome: "completed" });
    const added = events.filter((event) => event.type === "message.added");
    expect(settled?.finalMessageId).toBe((added.at(-1)?.message as { id: string } | undefined)?.id);

    // The second Run is self-contained: it starts from the first Run's history.
    const [started] = await read(port, "traced", secondId);
    expect(started?.history).toHaveLength(added.length);
    const exported = (await port.request({
      type: "export-trace",
      sessionId: "traced",
      runId: firstId,
    })) as string;
    expect(exported.trim().split("\n")).toHaveLength(events.length);
  });

  it("records the delivery mode and acceptance time of an applied steer", async () => {
    const port = connect();
    await port.request({ type: "subscribe", sessionId: "steer" });
    const item = submission("hold-steer");
    await port.request({ type: "submit", sessionId: "steer", submission: item });
    await vi.waitFor(() => expect(state.gates.has("hold-steer")).toBe(true));
    const steer = { ...submission("steered"), mode: "steer" as const };
    await port.request({ type: "submit", sessionId: "steer", submission: steer });
    state.gates.get("hold-steer")?.();
    await vi.waitFor(() => expect(state.traces.get(`steer/${item.id}`)).toContain('"run.settled"'));
    const applied = (await read(port, "steer", item.id)).find(
      (event) => event.type === "input.applied",
    );
    expect(applied).toMatchObject({ messageId: "steered", submissionId: steer.id, mode: "steer" });
    expect(typeof applied?.acceptedAt).toBe("number");
  });

  it("marks a tool still running when its Run settles as unknown and drops image data", async () => {
    // The loop settles interrupted tools itself; this covers a Run that ends without doing so.
    const { TraceRecorder, parseTrace } = await import("@/lib/agent-runtime/traceRecorder");
    const recorder = new TraceRecorder("open", "run", () => undefined);
    recorder.trace({
      type: "tool.started",
      toolCallId: "call",
      name: "read_file",
      arguments: {},
      turn: 1,
    });
    recorder.trace({
      type: "message.added",
      message: {
        id: "image",
        role: "user",
        content: [{ type: "image", mimeType: "image/png", data: "AAAA" }],
        createdAt: 1,
      },
      turn: 1,
    });
    await recorder.settle("aborted");
    const events = parseTrace(state.traces.get("open/run") ?? "");
    // Images keep their media type and size, never their data.
    expect(events.find((event) => event.type === "message.added")?.message).toMatchObject({
      content: [{ type: "image", mimeType: "image/png", size: 3 }],
    });
    expect(state.traces.get("open/run")).not.toContain("AAAA");
    expect(events.slice(-2)).toMatchObject([
      { type: "tool.settled", toolCallId: "call", name: "read_file", outcome: "unknown" },
      { type: "run.settled", outcome: "aborted" },
    ]);
  });

  it("follows a failed write with trace.gap on the next successful write", async () => {
    const port = connect();
    await port.request({ type: "host-ready" });
    await port.request({ type: "subscribe", sessionId: "gap" });
    state.failAppends = 1;
    const pending = run(port, "gap", "tool");
    await answerTool(port);
    const runId = await pending;
    const events = await read(port, "gap", runId);
    const gap = events.find((event) => event.type === "trace.gap");
    expect(gap).toMatchObject({ reason: "disk full" });
    expect(gap?.dropped).toBeGreaterThan(0);
    // The dropped events are gone; the ones after the gap were kept in order.
    expect(events.some((event) => event.type === "run.started")).toBe(false);
    expect(events.at(-1)?.type).toBe("run.settled");
  });

  it("deletes a chat session's Traces and keeps an in-memory session's", async () => {
    const port = connect();
    await port.request({ type: "subscribe", sessionId: "chat" });
    await port.request({ type: "subscribe", sessionId: "eval", storage: "memory" });
    await run(port, "chat", "question");
    const kept = await run(port, "eval", "question", "memory");
    await port.request({ type: "delete", sessionId: "chat" });
    await port.request({ type: "delete", sessionId: "eval", storage: "memory" });
    expect(await port.request({ type: "list-runs", sessionId: "chat" })).toEqual([]);
    expect(await port.request({ type: "list-runs", sessionId: "eval" })).toEqual([kept]);
    await port.request({ type: "clear-traces" });
    expect(await port.request({ type: "list-runs", sessionId: "eval" })).toEqual([]);
  });

  it("records nothing outside development builds", async () => {
    vi.stubEnv("DEV", false);
    await startWorker();
    const port = connect();
    await port.request({ type: "subscribe", sessionId: "prod" });
    await port.request({ type: "submit", sessionId: "prod", submission: submission("question") });
    await vi.waitFor(() => expect(port.snapshot()?.outcome).toBe("completed"));
    await port.request({ type: "checkpoint" });
    expect(state.traces.size).toBe(0);
  });
});
