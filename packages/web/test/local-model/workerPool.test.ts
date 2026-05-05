import type {
  LocalModelEventEnvelope,
  LocalModelWorkerMessage,
} from "@memora/local-model-runtime";
import { describe, expect, test, vi } from "vite-plus/test";

import { createLocalModelWorkerPool } from "../../src/lib/local-model/workerPool";

class MockWorker {
  private messageListeners: Array<(event: MessageEvent<LocalModelEventEnvelope>) => void> = [];

  addEventListener(type: string, listener: (event: MessageEvent<LocalModelEventEnvelope>) => void) {
    if (type === "message") {
      this.messageListeners.push(listener);
    }
  }

  postMessage(message: LocalModelWorkerMessage): void {
    if (message.type !== "run") return;

    this.emit(message.requestId, { type: "text-delta", delta: "Hello " });
    this.emit(message.requestId, { type: "text-delta", delta: "world" });
    this.emit(message.requestId, { type: "status", status: "completed" });
  }

  terminate(): void {}

  private emit(requestId: string, event: LocalModelEventEnvelope["event"]): void {
    const envelope = { requestId, event } satisfies LocalModelEventEnvelope;
    for (const listener of this.messageListeners) {
      listener({ data: envelope } as MessageEvent<LocalModelEventEnvelope>);
    }
  }
}

class DeferredWorker {
  private messageListeners: Array<(event: MessageEvent<LocalModelEventEnvelope>) => void> = [];
  private runs: LocalModelWorkerMessage[] = [];

  addEventListener(type: string, listener: (event: MessageEvent<LocalModelEventEnvelope>) => void) {
    if (type === "message") {
      this.messageListeners.push(listener);
    }
  }

  postMessage(message: LocalModelWorkerMessage): void {
    if (message.type !== "run") return;
    this.runs.push(message);
  }

  terminate(): void {}

  emit(requestId: string, event: LocalModelEventEnvelope["event"]): void {
    const envelope = { requestId, event } satisfies LocalModelEventEnvelope;
    for (const listener of this.messageListeners) {
      listener({ data: envelope } as MessageEvent<LocalModelEventEnvelope>);
    }
  }

  getRuns(): LocalModelWorkerMessage[] {
    return this.runs;
  }
}

describe("local model worker pool", () => {
  test("drains queued streaming events before completing the request", async () => {
    const pool = createLocalModelWorkerPool({
      pool: "chat",
      createWorker: () => new MockWorker() as unknown as Worker,
      maxWorkers: 1,
    });

    const events: Array<LocalModelEventEnvelope["event"]> = [];
    for await (const event of pool.run({
      requestId: "req-1",
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
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "status", status: "queued" },
      { type: "status", status: "assigned" },
      { type: "text-delta", delta: "Hello " },
      { type: "text-delta", delta: "world" },
    ]);
  });

  test("yields to the event loop between buffered streaming events", async () => {
    vi.useFakeTimers();
    try {
      const pool = createLocalModelWorkerPool({
        pool: "chat",
        createWorker: () => new MockWorker() as unknown as Worker,
        maxWorkers: 1,
      });

      const iterator = pool.run({
        requestId: "req-buffered",
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

      expect(await iterator.next()).toEqual({
        done: false,
        value: { type: "status", status: "queued" },
      });
      expect(await iterator.next()).toEqual({
        done: false,
        value: { type: "status", status: "assigned" },
      });
      expect(await iterator.next()).toEqual({
        done: false,
        value: { type: "text-delta", delta: "Hello " },
      });

      let settled = false;
      const nextPromise = iterator.next().then((result) => {
        settled = true;
        return result;
      });

      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.runAllTimersAsync();
      expect(await nextPromise).toEqual({
        done: false,
        value: { type: "text-delta", delta: "world" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps preload and generation for the same model on the same worker", async () => {
    const workers: DeferredWorker[] = [];
    const pool = createLocalModelWorkerPool({
      pool: "chat",
      createWorker: () => {
        const worker = new DeferredWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
      maxWorkers: 2,
    });

    const preloadEvents: Array<LocalModelEventEnvelope["event"]> = [];
    const chatEvents: Array<LocalModelEventEnvelope["event"]> = [];

    const preloadRun = (async () => {
      for await (const event of pool.run({
        requestId: "preload-1",
        priority: "background",
        task: { kind: "model.preload", input: { modelId: "gemma-4-e2b-it-onnx" } },
      })) {
        preloadEvents.push(event);
      }
    })();

    await Promise.resolve();
    expect(workers[0]?.getRuns()).toHaveLength(1);

    const chatRun = (async () => {
      for await (const event of pool.run({
        requestId: "chat-1",
        priority: "interactive",
        task: {
          kind: "chat.generate",
          input: {
            modelId: "gemma-4-e2b-it-onnx",
            systemPrompt: "",
            messages: [],
            tools: [],
          },
        },
      })) {
        chatEvents.push(event);
      }
    })();

    await Promise.resolve();
    expect(workers[0]?.getRuns()).toHaveLength(1);
    expect(workers[1]?.getRuns() ?? []).toHaveLength(0);

    workers[0]?.emit("preload-1", { type: "status", status: "completed" });
    await Promise.resolve();

    expect(workers[0]?.getRuns()).toHaveLength(2);
    expect(workers[1]?.getRuns() ?? []).toHaveLength(0);

    workers[0]?.emit("chat-1", { type: "text-delta", delta: "hi" });
    workers[0]?.emit("chat-1", { type: "status", status: "completed" });

    await Promise.all([preloadRun, chatRun]);

    expect(preloadEvents).toEqual([
      { type: "status", status: "queued" },
      { type: "status", status: "assigned" },
    ]);
    expect(chatEvents).toEqual([
      { type: "status", status: "queued" },
      { type: "status", status: "assigned" },
      { type: "text-delta", delta: "hi" },
    ]);
  });

  test("keeps sequential generations for the same model on the same worker", async () => {
    const workers: DeferredWorker[] = [];
    const pool = createLocalModelWorkerPool({
      pool: "chat",
      createWorker: () => {
        const worker = new DeferredWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
      maxWorkers: 2,
    });

    const runChat = async (requestId: string) => {
      const events: Array<LocalModelEventEnvelope["event"]> = [];
      const run = (async () => {
        for await (const event of pool.run({
          requestId,
          priority: "interactive",
          task: {
            kind: "chat.generate",
            input: {
              modelId: "gemma-4-e2b-it-onnx",
              systemPrompt: "",
              messages: [],
              tools: [],
            },
          },
        })) {
          events.push(event);
        }
      })();
      await Promise.resolve();
      workers[0]?.emit(requestId, { type: "text-delta", delta: requestId });
      workers[0]?.emit(requestId, { type: "status", status: "completed" });
      await run;
      return events;
    };

    await runChat("chat-1");
    await runChat("chat-2");

    expect(workers).toHaveLength(1);
    expect(workers[0]?.getRuns()).toHaveLength(2);
  });
});
