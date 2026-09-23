import type {
  LocalAsrEvent,
  LocalAsrStream,
  LocalModelEvent,
  LocalModelPoolKey,
  LocalModelPriority,
  LocalModelSequencedEventEnvelope,
  LocalModelSharedWorkerMessage,
  LocalModelStreamAcknowledgement,
  LocalModelTask,
} from "@memora/local-model-runtime";

import {
  assignLocalModelWorkerRequest,
  clearLocalModelPoolDebug,
  recordLocalModelWorkerRuntimeLoad,
  registerLocalModelWorker,
  updateLocalModelWorkerStatus,
} from "../local-model/devtools";
import type { LocalModelWorkerDebugMessage } from "../../workers/local-model/debug";
import { createVectorDbClient, type VectorDbClient } from "../vector-db";

interface RunModelWorkerTaskInput {
  priority: LocalModelPriority;
  task: LocalModelTask;
  signal?: AbortSignal;
  transfer?: Transferable[];
}

interface PendingRequest {
  requestId: string;
  pool: LocalModelPoolKey;
  priority: LocalModelPriority;
  task: LocalModelTask;
  events: LocalModelEvent[];
  waiters: Array<(result: IteratorResult<LocalModelEvent>) => void>;
  lastSequence: number;
  closed: boolean;
  acknowledged: boolean;
  streamAcks: Map<string, { resolve: () => void; reject: (error: Error) => void }>;
  completion: Promise<void>;
  resolveCompletion: () => void;
}

interface PoolConnection {
  worker: SharedWorker;
  port: MessagePort;
}

type SharedWorkerResponse =
  | LocalModelSequencedEventEnvelope
  | LocalModelStreamAcknowledgement
  | LocalModelWorkerDebugMessage;

const POOLS: LocalModelPoolKey[] = ["asr", "chat", "embedding", "formula"];

const createSharedModelWorker = (pool: LocalModelPoolKey): SharedWorker => {
  switch (pool) {
    case "asr":
      return new SharedWorker(
        new URL("../../workers/localModel.shared-worker.ts", import.meta.url),
        {
          type: "module",
          name: "memora-model-asr",
          extendedLifetime: true,
        },
      );
    case "chat":
      return new SharedWorker(
        new URL("../../workers/localModel.shared-worker.ts", import.meta.url),
        {
          type: "module",
          name: "memora-model-chat",
          extendedLifetime: true,
        },
      );
    case "embedding":
      return new SharedWorker(
        new URL("../../workers/localModel.shared-worker.ts", import.meta.url),
        {
          type: "module",
          name: "memora-model-embedding",
          extendedLifetime: true,
        },
      );
    case "formula":
      return new SharedWorker(
        new URL("../../workers/localModel.shared-worker.ts", import.meta.url),
        {
          type: "module",
          name: "memora-model-formula",
          extendedLifetime: true,
        },
      );
  }
};

const createRequestId = (): string => crypto.randomUUID();

const yieldToEventLoop = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const isStreamingEvent = (event: LocalModelEvent): boolean => {
  return (
    event.type === "text-delta" ||
    event.type === "reasoning-delta" ||
    event.type === "tool-call-args-delta" ||
    event.type === "transcript-delta"
  );
};

export interface ModelWorkerFactory {
  mount: () => () => void;
  run: (pool: LocalModelPoolKey, input: RunModelWorkerTaskInput) => AsyncGenerator<LocalModelEvent>;
  openAsrStream: (input: {
    request: { modelId: string; language: string; returnTimestamps?: "word" };
    priority: LocalModelPriority;
    signal?: AbortSignal;
  }) => LocalAsrStream;
  vectorDb: VectorDbClient;
}

export const createModelWorkerFactory = (): ModelWorkerFactory => {
  const connections = new Map<LocalModelPoolKey, PoolConnection>();
  const pending = new Map<string, PendingRequest>();
  const vectorDb = createVectorDbClient();
  let mountCount = 0;

  const finishRequest = (request: PendingRequest): void => {
    if (!request.closed || request.events.length > 0) return;
    for (const waiter of request.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
    const connection = connections.get(request.pool);
    if (!request.acknowledged && connection) {
      request.acknowledged = true;
      connection.port.postMessage({
        type: "acknowledge",
        requestId: request.requestId,
      } satisfies LocalModelSharedWorkerMessage);
    }
    if (request.acknowledged) pending.delete(request.requestId);
  };

  const pushEvent = (request: PendingRequest, event: LocalModelEvent): void => {
    if (import.meta.env.DEV) {
      console.warn("[local-model-factory] event received", {
        pool: request.pool,
        requestId: request.requestId,
        type: event.type,
        status: event.type === "status" ? event.status : undefined,
        file: event.type === "model-progress" ? event.file : undefined,
        progress: event.type === "model-progress" ? event.progress : undefined,
      });
    }
    if (event.type === "status") {
      updateLocalModelWorkerStatus({
        pool: request.pool,
        requestId: request.requestId,
        status: event.status,
      });
      if (event.status === "assigned") {
        assignLocalModelWorkerRequest({
          pool: request.pool,
          workerId: 0,
          requestId: request.requestId,
          priority: request.priority,
          task: request.task,
        });
      }
      if (event.status === "completed" || event.status === "failed" || event.status === "aborted") {
        request.closed = true;
        request.resolveCompletion();
        for (const ack of request.streamAcks.values()) {
          ack.reject(new Error("The transcription stream closed before processing audio."));
        }
        request.streamAcks.clear();
        finishRequest(request);
        return;
      }
    }

    const waiter = request.waiters.shift();
    if (waiter) waiter({ done: false, value: event });
    else request.events.push(event);
  };

  const handleResponse = (pool: LocalModelPoolKey, response: SharedWorkerResponse): void => {
    if (import.meta.env.DEV) {
      console.warn("[local-model-factory] response received", {
        pool,
        type: response.type,
        requestId: response.type === "event" ? response.requestId : undefined,
        sequence: response.type === "event" ? response.sequence : undefined,
      });
    }
    if (response.type === "debug") {
      if (response.payload.kind === "runtime-loaded") {
        recordLocalModelWorkerRuntimeLoad({
          pool,
          workerId: 0,
          event: response.payload,
        });
      }
      return;
    }

    if (response.type === "stream-ack") {
      const request = pending.get(response.requestId);
      const ack = request?.streamAcks.get(response.chunkId);
      if (!request || !ack) return;
      request.streamAcks.delete(response.chunkId);
      if (response.accepted) ack.resolve();
      else ack.reject(new Error(response.error ?? "The transcription stream rejected audio."));
      return;
    }

    const request = pending.get(response.requestId);
    if (!request || response.sequence <= request.lastSequence) return;
    request.lastSequence = response.sequence;
    pushEvent(request, response.event);
  };

  const connectPool = (pool: LocalModelPoolKey): void => {
    if (connections.has(pool)) return;
    console.warn("[local-model-factory] connect pool", { pool });
    const worker = createSharedModelWorker(pool);
    const port = worker.port;
    const connection = { worker, port };
    connections.set(pool, connection);
    registerLocalModelWorker({ pool, workerId: 0 });

    port.addEventListener("message", (event: MessageEvent<SharedWorkerResponse>) => {
      handleResponse(pool, event.data);
    });
    worker.addEventListener("error", (event) => {
      console.error("[local-model-factory] shared worker error", {
        pool,
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
      for (const request of pending.values()) {
        if (request.pool !== pool || request.closed) continue;
        pushEvent(request, {
          type: "error",
          error: {
            code: "worker-crashed",
            message: `The ${pool} shared model worker stopped unexpectedly.`,
          },
        });
        pushEvent(request, { type: "status", status: "failed" });
      }
    });
    port.start();
    console.warn("[local-model-factory] pool connected", { pool });

    for (const request of pending.values()) {
      if (request.pool !== pool) continue;
      if (request.closed && request.events.length === 0) {
        request.acknowledged = true;
        port.postMessage({
          type: "acknowledge",
          requestId: request.requestId,
        } satisfies LocalModelSharedWorkerMessage);
        pending.delete(request.requestId);
        continue;
      }
      port.postMessage({
        type: "subscribe",
        requestId: request.requestId,
        afterSequence: request.lastSequence,
      } satisfies LocalModelSharedWorkerMessage);
    }
  };

  const disconnectPool = (pool: LocalModelPoolKey): void => {
    const connection = connections.get(pool);
    if (!connection) return;
    connection.port.postMessage({ type: "disconnect" } satisfies LocalModelSharedWorkerMessage);
    connection.port.close();
    connections.delete(pool);
    clearLocalModelPoolDebug(pool);
  };

  const cancel = (request: PendingRequest): void => {
    if (request.closed) return;
    connections.get(request.pool)?.port.postMessage({
      type: "cancel",
      requestId: request.requestId,
    } satisfies LocalModelSharedWorkerMessage);
  };

  const createPendingRequest = (
    pool: LocalModelPoolKey,
    input: RunModelWorkerTaskInput,
  ): PendingRequest => {
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    return {
      requestId: createRequestId(),
      pool,
      priority: input.priority,
      task: input.task,
      events: [],
      waiters: [],
      lastSequence: 0,
      closed: false,
      acknowledged: false,
      streamAcks: new Map(),
      completion,
      resolveCompletion,
    };
  };

  const sendRequest = (request: PendingRequest, input: RunModelWorkerTaskInput): PoolConnection => {
    const connection = connections.get(request.pool);
    if (!connection)
      throw new Error("The shared model worker factory is not mounted at the root route.");
    pending.set(request.requestId, request);
    connection.port.postMessage(
      {
        type: "run",
        requestId: request.requestId,
        priority: request.priority,
        task: request.task,
      } satisfies LocalModelSharedWorkerMessage,
      input.transfer ?? [],
    );
    return connection;
  };

  return {
    mount() {
      const unmountVectorDb = vectorDb.mount();
      mountCount += 1;
      if (mountCount === 1) {
        console.warn("[local-model-factory] mount workers");
        for (const pool of POOLS) connectPool(pool);
      }
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        unmountVectorDb();
        mountCount = Math.max(0, mountCount - 1);
        if (mountCount === 0) {
          queueMicrotask(() => {
            if (mountCount === 0) for (const pool of POOLS) disconnectPool(pool);
          });
        }
      };
    },
    vectorDb,
    openAsrStream({ request: streamRequest, priority, signal }) {
      const request = createPendingRequest("asr", {
        priority,
        task: { kind: "asr.stream-open", input: streamRequest },
        signal,
      });
      const connection = sendRequest(request, { priority, task: request.task, signal });
      const abortHandler = () => cancel(request);
      signal?.addEventListener("abort", abortHandler, { once: true });
      let closing = false;
      return {
        events: (async function* () {
          try {
            while (!request.closed || request.events.length > 0) {
              const event = request.events.shift();
              if (event) {
                yield event as LocalAsrEvent;
                finishRequest(request);
                continue;
              }
              if (request.closed) break;
              const result = await new Promise<IteratorResult<LocalModelEvent>>((resolve) => {
                request.waiters.push(resolve);
              });
              if (result.done) break;
              yield result.value as LocalAsrEvent;
            }
          } finally {
            signal?.removeEventListener("abort", abortHandler);
            if (!request.closed) cancel(request);
            finishRequest(request);
          }
        })(),
        write(audio: Float32Array) {
          if (closing || request.closed)
            return Promise.reject(new Error("The transcription stream is closed."));
          const chunkId = createRequestId();
          return new Promise<void>((resolve, reject) => {
            request.streamAcks.set(chunkId, { resolve, reject });
            connection.port.postMessage(
              {
                type: "stream-chunk",
                requestId: request.requestId,
                chunkId,
                audio,
              } satisfies LocalModelSharedWorkerMessage,
              [audio.buffer],
            );
          });
        },
        async close() {
          if (!closing) {
            closing = true;
            connection.port.postMessage({
              type: "stream-close",
              requestId: request.requestId,
            } satisfies LocalModelSharedWorkerMessage);
          }
          await request.completion;
        },
        abort() {
          closing = true;
          cancel(request);
        },
      };
    },
    async *run(pool, input) {
      const request = createPendingRequest(pool, input);
      console.warn("[local-model-factory] send run", {
        pool,
        requestId: request.requestId,
        task: input.task.kind,
        modelId: "modelId" in input.task.input ? input.task.input.modelId : undefined,
      });
      const abortHandler = () => cancel(request);
      input.signal?.addEventListener("abort", abortHandler, { once: true });
      sendRequest(request, input);
      console.warn("[local-model-factory] run sent", { pool, requestId: request.requestId });

      try {
        while (!request.closed || request.events.length > 0) {
          const event = request.events.shift();
          if (event) {
            yield event;
            if (request.events.length > 0 && isStreamingEvent(event)) await yieldToEventLoop();
            finishRequest(request);
            continue;
          }
          if (request.closed) break;

          const result = await new Promise<IteratorResult<LocalModelEvent>>((resolve) => {
            request.waiters.push(resolve);
          });
          if (result.done) break;
          yield result.value;
        }
      } finally {
        input.signal?.removeEventListener("abort", abortHandler);
        if (!request.closed) cancel(request);
        finishRequest(request);
      }
    },
  };
};

export const modelWorkerFactory = createModelWorkerFactory();
