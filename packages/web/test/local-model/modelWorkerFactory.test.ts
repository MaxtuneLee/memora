import type {
  LocalModelEvent,
  LocalModelSequencedEventEnvelope,
  LocalModelSharedWorkerMessage,
} from "@memora/local-model-runtime";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { createModelWorkerFactory } from "../../src/lib/model-worker/factory";

class MockMessagePort {
  readonly posted: LocalModelSharedWorkerMessage[] = [];
  closed = false;
  private listeners: Array<(event: MessageEvent) => void> = [];

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === "message") this.listeners.push(listener);
  }

  postMessage(message: LocalModelSharedWorkerMessage): void {
    this.posted.push(message);
  }

  start(): void {}

  close(): void {
    this.closed = true;
  }

  emit(message: LocalModelSequencedEventEnvelope): void {
    for (const listener of this.listeners) {
      listener({ data: message } as MessageEvent);
    }
  }
}

class MockSharedWorker {
  static instances: MockSharedWorker[] = [];

  readonly port = new MockMessagePort();
  readonly name: string;
  private errorListeners: Array<() => void> = [];

  constructor(_url: URL, options?: string | WorkerOptions) {
    this.name = typeof options === "object" ? (options.name ?? "") : (options ?? "");
    MockSharedWorker.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "error") this.errorListeners.push(listener);
  }
}

const getWorker = (name: string): MockSharedWorker => {
  const worker = MockSharedWorker.instances.find((candidate) => candidate.name === name);
  if (!worker) throw new Error(`Missing mock worker ${name}.`);
  return worker;
};

const getRunMessage = (port: MockMessagePort) => {
  const message = port.posted.find(
    (candidate): candidate is Extract<LocalModelSharedWorkerMessage, { type: "run" }> =>
      candidate.type === "run",
  );
  if (!message) throw new Error("Missing run message.");
  return message;
};

const emit = (
  port: MockMessagePort,
  requestId: string,
  sequence: number,
  event: LocalModelEvent,
): void => {
  port.emit({ type: "event", requestId, sequence, event });
};

describe("model worker factory", () => {
  beforeEach(() => {
    MockSharedWorker.instances = [];
    vi.stubGlobal("SharedWorker", MockSharedWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("mounts one named shared worker per independent model pool", () => {
    const factory = createModelWorkerFactory();
    const unmountFirst = factory.mount();
    const unmountSecond = factory.mount();

    expect(MockSharedWorker.instances.map((worker) => worker.name)).toEqual([
      "memora-model-asr",
      "memora-model-chat",
      "memora-model-embedding",
      "memora-model-formula",
      "memora-vector-db",
    ]);

    unmountFirst();
    expect(MockSharedWorker.instances.every((worker) => !worker.port.closed)).toBe(true);
    unmountSecond();
    expect(MockSharedWorker.instances.every((worker) => worker.port.closed)).toBe(true);
    expect(
      MockSharedWorker.instances
        .filter((worker) => worker.name !== "memora-vector-db")
        .every((worker) => worker.port.posted.some((message) => message.type === "disconnect")),
    ).toBe(true);
  });

  test("reconnects an unfinished request and deduplicates replayed event sequences", async () => {
    const factory = createModelWorkerFactory();
    const unmount = factory.mount();
    const firstChatWorker = getWorker("memora-model-chat");
    const iterator = factory.run("chat", {
      priority: "interactive",
      task: {
        kind: "chat.generate",
        input: {
          modelId: "qwen3.5-0.8b-onnx-opt",
          systemPrompt: "",
          messages: [],
          tools: [],
        },
      },
    });

    const firstEvent = iterator.next();
    const runMessage = getRunMessage(firstChatWorker.port);
    emit(firstChatWorker.port, runMessage.requestId, 1, { type: "status", status: "queued" });
    expect(await firstEvent).toEqual({
      done: false,
      value: { type: "status", status: "queued" },
    });

    const secondEvent = iterator.next();
    unmount();
    expect(firstChatWorker.port.posted.some((message) => message.type === "cancel")).toBe(false);
    const remount = factory.mount();
    const secondChatWorker = MockSharedWorker.instances.filter(
      (worker) => worker.name === "memora-model-chat",
    )[1];
    expect(secondChatWorker?.port.posted).toContainEqual({
      type: "subscribe",
      requestId: runMessage.requestId,
      afterSequence: 1,
    });

    emit(secondChatWorker!.port, runMessage.requestId, 1, {
      type: "status",
      status: "queued",
    });
    emit(secondChatWorker!.port, runMessage.requestId, 2, {
      type: "text-delta",
      delta: "continued",
    });
    expect(await secondEvent).toEqual({
      done: false,
      value: { type: "text-delta", delta: "continued" },
    });

    const completion = iterator.next();
    emit(secondChatWorker!.port, runMessage.requestId, 3, {
      type: "status",
      status: "completed",
    });
    expect(await completion).toEqual({ done: true, value: undefined });
    expect(secondChatWorker?.port.posted).toContainEqual({
      type: "acknowledge",
      requestId: runMessage.requestId,
    });
    remount();
  });
});
