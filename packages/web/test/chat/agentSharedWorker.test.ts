import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  AgentRequest,
  AgentCommand,
  AgentResponse,
  AgentSubmission,
} from "@/lib/agent-runtime/protocol";
import type { ChatSessionRecord } from "@/lib/chat/chatSessionStorage";

const state = vi.hoisted(() => ({
  records: new Map<string, ChatSessionRecord>(),
  gates: new Map<string, () => void>(),
  calls: [] as string[],
}));
vi.mock("@/lib/chat/chatSessionStorage", () => ({
  loadChatSession: async (id: string) => structuredClone(state.records.get(id) ?? null),
  updateChatSession: async (
    id: string,
    update: (record: ChatSessionRecord) => ChatSessionRecord,
  ) => {
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
beforeEach(async () => {
  vi.resetModules();
  state.records.clear();
  state.calls = [];
  state.gates.clear();
  const scope: { onconnect?: (event: MessageEvent) => void } = {};
  vi.stubGlobal("self", scope);
  await import("@/workers/agent.shared-worker");
  connect = () => {
    const port = new Port();
    scope.onconnect?.({ ports: [port] } as unknown as MessageEvent);
    return port;
  };
});
afterEach(() => {
  for (const finish of state.gates.values()) finish();
  vi.unstubAllGlobals();
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
