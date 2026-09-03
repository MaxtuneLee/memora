import type {
  LocalModelEvent,
  LocalModelPoolKey,
  LocalModelPriority,
  LocalModelSequencedEventEnvelope,
  LocalModelSharedWorkerMessage,
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
}

interface PoolConnection {
  worker: SharedWorker;
  port: MessagePort;
}

type SharedWorkerResponse = LocalModelSequencedEventEnvelope | LocalModelWorkerDebugMessage;

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
    console.warn("[local-model-factory] event received", {
      pool: request.pool,
      requestId: request.requestId,
      type: event.type,
      status: event.type === "status" ? event.status : undefined,
      file: event.type === "model-progress" ? event.file : undefined,
      progress: event.type === "model-progress" ? event.progress : undefined,
    });
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
        finishRequest(request);
        return;
      }
    }

    const waiter = request.waiters.shift();
    if (waiter) waiter({ done: false, value: event });
    else request.events.push(event);
  };

  const handleResponse = (pool: LocalModelPoolKey, response: SharedWorkerResponse): void => {
    console.warn("[local-model-factory] response received", {
      pool,
      type: response.type,
      requestId: response.type === "event" ? response.requestId : undefined,
      sequence: response.type === "event" ? response.sequence : undefined,
    });
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
          for (const pool of POOLS) disconnectPool(pool);
        }
      };
    },
    vectorDb,
    async *run(pool, input) {
      const connection = connections.get(pool);
      if (!connection) {
        console.error("[local-model-factory] run without connection", { pool, task: input.task.kind });
        throw new Error("The shared model worker factory is not mounted at the root route.");
      }

      const request: PendingRequest = {
        requestId: createRequestId(),
        pool,
        priority: input.priority,
        task: input.task,
        events: [],
        waiters: [],
        lastSequence: 0,
        closed: false,
        acknowledged: false,
      };
      pending.set(request.requestId, request);
      console.warn("[local-model-factory] send run", {
        pool,
        requestId: request.requestId,
        task: input.task.kind,
        modelId: "modelId" in input.task.input ? input.task.input.modelId : undefined,
      });
      const abortHandler = () => cancel(request);
      input.signal?.addEventListener("abort", abortHandler, { once: true });
      connection.port.postMessage({
        type: "run",
        requestId: request.requestId,
        priority: request.priority,
        task: request.task,
      } satisfies LocalModelSharedWorkerMessage);
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
