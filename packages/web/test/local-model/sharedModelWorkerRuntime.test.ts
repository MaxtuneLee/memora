import type {
  LocalModelEvent,
  LocalModelSharedWorkerMessage,
  LocalModelTask,
} from "@memora/local-model-runtime";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const restoredSnapshots = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("../../src/workers/model-worker/snapshotStore", () => ({
  readModelWorkerSnapshots: async () => restoredSnapshots,
  removeModelWorkerSnapshot: async () => undefined,
  writeModelWorkerSnapshotState: async () => undefined,
  writeModelWorkerSnapshotTask: async () => undefined,
}));

import { startSharedModelWorkerRuntime } from "../../src/workers/model-worker/sharedRuntime";

class MockPort {
  readonly posted: Array<Record<string, unknown>> = [];
  private listener: ((event: MessageEvent<LocalModelSharedWorkerMessage>) => void) | null = null;

  addEventListener(
    type: string,
    listener: (event: MessageEvent<LocalModelSharedWorkerMessage>) => void,
  ): void {
    if (type === "message") this.listener = listener;
  }

  postMessage(message: Record<string, unknown>): void {
    this.posted.push(message);
  }

  start(): void {}

  deliver(message: LocalModelSharedWorkerMessage): void {
    this.listener?.({ data: message } as MessageEvent<LocalModelSharedWorkerMessage>);
  }
}

class MockSharedWorkerScope {
  private connectListener: ((event: MessageEvent) => void) | null = null;

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === "connect") this.connectListener = listener;
  }

  connect(port: MockPort): void {
    this.connectListener?.({ ports: [port] } as unknown as MessageEvent);
  }
}

const chatTask: Extract<LocalModelTask, { kind: "chat.generate" }> = {
  kind: "chat.generate",
  input: {
    modelId: "qwen3.5-0.8b-onnx-opt",
    systemPrompt: "",
    messages: [],
    tools: [],
  },
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("shared model worker runtime", () => {
  beforeEach(() => restoredSnapshots.splice(0));

  test("serializes requests from different tabs inside one shared pool", async () => {
    const scope = new MockSharedWorkerScope();
    vi.stubGlobal("self", scope);
    const releases: Array<() => void> = [];
    const starts: string[] = [];
    startSharedModelWorkerRuntime("chat", async (task, context) => {
      if (task.kind !== "chat.generate") throw new Error("Expected a chat task.");
      starts.push(task.input.modelId);
      context.emit({ type: "status", status: "running" });
      await new Promise<void>((resolve) => releases.push(resolve));
      context.emit({ type: "text-delta", delta: task.input.modelId });
    });

    const firstPort = new MockPort();
    const secondPort = new MockPort();
    scope.connect(firstPort);
    scope.connect(secondPort);
    firstPort.deliver({
      type: "run",
      requestId: "first",
      priority: "interactive",
      task: chatTask,
    });
    secondPort.deliver({
      type: "run",
      requestId: "second",
      priority: "interactive",
      task: {
        ...chatTask,
        input: { ...chatTask.input, modelId: "gemma-4-e2b-it-onnx" },
      },
    });
    await flushPromises();

    expect(starts).toEqual(["qwen3.5-0.8b-onnx-opt"]);
    releases.shift()?.();
    await flushPromises();
    expect(starts).toEqual(["qwen3.5-0.8b-onnx-opt", "gemma-4-e2b-it-onnx"]);
    expect(
      firstPort.posted.every(
        (message) => message.requestId === undefined || message.requestId === "first",
      ),
    ).toBe(true);
    expect(
      secondPort.posted.every(
        (message) => message.requestId === undefined || message.requestId === "second",
      ),
    ).toBe(true);

    releases.shift()?.();
    await flushPromises();
    vi.unstubAllGlobals();
  });

  test("restarts an interrupted snapshot without emitting an identical saved output twice", async () => {
    restoredSnapshots.push({
      requestId: "restored",
      priority: "interactive",
      task: chatTask,
      status: "running",
      events: [{ sequence: 1, event: { type: "text-delta", delta: "saved" } }],
      createdAt: 1,
      updatedAt: 2,
    });
    const scope = new MockSharedWorkerScope();
    vi.stubGlobal("self", scope);
    startSharedModelWorkerRuntime("chat", async (_task, context) => {
      context.emit({ type: "text-delta", delta: "saved" });
      context.emit({ type: "text-delta", delta: " continued" });
    });

    const port = new MockPort();
    scope.connect(port);
    port.deliver({ type: "subscribe", requestId: "restored", afterSequence: 0 });
    await flushPromises();

    const deltas = port.posted
      .map((message) => message.event as LocalModelEvent | undefined)
      .filter((event): event is Extract<LocalModelEvent, { type: "text-delta" }> =>
        Boolean(event?.type === "text-delta"),
      )
      .map((event) => event.delta);
    expect(deltas).toEqual(["saved", " continued"]);
    vi.unstubAllGlobals();
  });
});
