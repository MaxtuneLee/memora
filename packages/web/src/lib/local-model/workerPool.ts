import { createLocalModelTaskQueue } from "@memora/local-model-runtime";
import type {
  LocalModelEvent,
  LocalModelEventEnvelope,
  LocalModelPoolKey,
  LocalModelPriority,
  LocalModelTask,
  LocalModelWorkerMessage,
} from "@memora/local-model-runtime";

import {
  assignLocalModelWorkerRequest,
  clearLocalModelPoolDebug,
  recordLocalModelWorkerRuntimeLoad,
  registerLocalModelWorker,
  updateLocalModelWorkerStatus,
} from "./devtools";
import type { LocalModelWorkerDebugMessage } from "../../workers/local-model/debug";

interface RunLocalModelTaskInput {
  requestId: string;
  priority: LocalModelPriority;
  task: LocalModelTask;
  signal?: AbortSignal;
}

export interface LocalModelWorkerPool {
  run: (input: RunLocalModelTaskInput) => AsyncGenerator<LocalModelEvent>;
  terminate: () => void;
}

interface PendingRequest {
  events: LocalModelEvent[];
  waiters: Array<(result: IteratorResult<LocalModelEvent>) => void>;
  done: boolean;
  closed: boolean;
  workerId?: number;
}

interface WorkerSlot {
  id: number;
  worker: Worker;
  activeRequestId?: string;
  modelId?: string;
}

type WorkerMessageFromWorker = LocalModelEventEnvelope | LocalModelWorkerDebugMessage;

const DEFAULT_MAX_WORKERS = 2;

const yieldToEventLoop = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const getTaskModelId = (task: LocalModelTask): string | undefined => {
  switch (task.kind) {
    case "chat.generate":
    case "asr.transcribe":
      return task.input.modelId;
    case "model.preload":
      return task.input.modelId;
    default:
      return undefined;
  }
};

export const createLocalModelWorkerPool = (options: {
  pool: LocalModelPoolKey;
  createWorker: () => Worker;
  maxWorkers?: number;
}): LocalModelWorkerPool => {
  const maxWorkers = Math.max(1, Math.floor(options.maxWorkers ?? DEFAULT_MAX_WORKERS));
  const pending = new Map<string, PendingRequest>();
  const queue = createLocalModelTaskQueue();
  const workers: WorkerSlot[] = [];
  let nextWorkerId = 0;

  const finishRequest = (requestId: string): void => {
    const request = pending.get(requestId);
    if (!request || request.done) return;

    request.done = true;
    pending.delete(requestId);
    const workerSlot = workers.find((slot) => slot.activeRequestId === requestId);
    if (workerSlot) {
      updateLocalModelWorkerStatus({
        pool: options.pool,
        requestId,
        status: "completed",
      });
      workerSlot.activeRequestId = undefined;
    }

    for (const waiter of request.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }

    dispatchQueuedTasks();
  };

  const closeRequest = (requestId: string): void => {
    const request = pending.get(requestId);
    if (!request || request.done || request.closed) return;

    request.closed = true;
    if (request.events.length === 0) {
      finishRequest(requestId);
    }
  };

  const pushEvent = (requestId: string, event: LocalModelEvent): void => {
    const request = pending.get(requestId);
    if (!request || request.done) return;

    if (event.type === "status" && (event.status === "completed" || event.status === "aborted")) {
      closeRequest(requestId);
      return;
    }

    const waiter = request.waiters.shift();
    if (waiter) {
      waiter({ done: false, value: event });
    } else {
      request.events.push(event);
    }
  };

  const createWorkerSlot = (): WorkerSlot => {
    const slot: WorkerSlot = {
      id: nextWorkerId,
      worker: options.createWorker(),
    };
    nextWorkerId += 1;
    registerLocalModelWorker({ pool: options.pool, workerId: slot.id });
    slot.worker.addEventListener("message", (event: MessageEvent<WorkerMessageFromWorker>) => {
      const message = event.data;
      if ("type" in message) {
        if (message.payload.kind === "runtime-loaded") {
          recordLocalModelWorkerRuntimeLoad({
            pool: options.pool,
            workerId: slot.id,
            event: {
              family: message.payload.family,
              modelId: message.payload.modelId,
              adapter: message.payload.adapter,
              runtime: message.payload.runtime,
            },
          });
        }
        return;
      }

      const modelEvent = message;
      if (modelEvent.event.type === "status") {
        updateLocalModelWorkerStatus({
          pool: options.pool,
          requestId: modelEvent.requestId,
          status: modelEvent.event.status,
        });
      }
      if (modelEvent.event.type === "error") {
        updateLocalModelWorkerStatus({
          pool: options.pool,
          requestId: modelEvent.requestId,
          status: "failed",
        });
      }
      pushEvent(modelEvent.requestId, modelEvent.event);
    });
    workers.push(slot);
    return slot;
  };

  const getIdleWorker = (): WorkerSlot | null => {
    const idleWorker = workers.find((slot) => !slot.activeRequestId);
    if (idleWorker) return idleWorker;
    if (workers.length < maxWorkers) return createWorkerSlot();
    return null;
  };

  const takeDispatchableTask = (workerSlot: WorkerSlot) => {
    if (workerSlot.modelId) {
      const preferredTask = queue.dequeueMatching(
        (queuedTask) => getTaskModelId(queuedTask.task) === workerSlot.modelId,
      );
      if (preferredTask) {
        return preferredTask;
      }
    }

    return queue.dequeueMatching((queuedTask) => {
      const modelId = getTaskModelId(queuedTask.task);
      if (!modelId) {
        return true;
      }

      const owner = workers.find((slot) => slot.modelId === modelId);
      if (!owner) {
        return true;
      }

      return owner.id === workerSlot.id && !owner.activeRequestId;
    });
  };

  function dispatchQueuedTasks(): void {
    let workerSlot = queue.size() > 0 ? getIdleWorker() : null;
    while (workerSlot) {
      const queuedTask = takeDispatchableTask(workerSlot);
      if (!queuedTask) return;

      const request = pending.get(queuedTask.requestId);
      if (!request || request.done) {
        workerSlot = queue.size() > 0 ? getIdleWorker() : null;
        continue;
      }

      const modelId = getTaskModelId(queuedTask.task);
      request.workerId = workerSlot.id;
      workerSlot.activeRequestId = queuedTask.requestId;
      if (modelId) {
        workerSlot.modelId = modelId;
      }
      assignLocalModelWorkerRequest({
        pool: options.pool,
        workerId: workerSlot.id,
        requestId: queuedTask.requestId,
        priority: queuedTask.priority,
        task: queuedTask.task,
      });
      pushEvent(queuedTask.requestId, { type: "status", status: "assigned" });
      workerSlot.worker.postMessage({
        type: "run",
        requestId: queuedTask.requestId,
        priority: queuedTask.priority,
        task: queuedTask.task,
      } satisfies LocalModelWorkerMessage);

      workerSlot = queue.size() > 0 ? getIdleWorker() : null;
    }
  }

  const cancel = (requestId: string): void => {
    const request = pending.get(requestId);
    if (!request || request.done) return;

    queue.remove(requestId);
    const workerSlot = workers.find((slot) => slot.activeRequestId === requestId);
    workerSlot?.worker.postMessage({ type: "cancel", requestId } satisfies LocalModelWorkerMessage);
    finishRequest(requestId);
  };

  return {
    async *run(input) {
      const request: PendingRequest = {
        events: [],
        waiters: [],
        done: false,
        closed: false,
      };
      pending.set(input.requestId, request);

      const abortHandler = () => cancel(input.requestId);
      input.signal?.addEventListener("abort", abortHandler, { once: true });

      queue.enqueue({
        requestId: input.requestId,
        priority: input.priority,
        task: input.task,
      });
      pushEvent(input.requestId, { type: "status", status: "queued" });
      dispatchQueuedTasks();

      try {
        while (!request.done) {
          const queuedEvent = request.events.shift();
          if (queuedEvent) {
            yield queuedEvent;
            if (request.events.length > 0 && isStreamingEvent(queuedEvent)) {
              await yieldToEventLoop();
            }
            if (request.closed && request.events.length === 0) {
              finishRequest(input.requestId);
            }
            continue;
          }

          if (request.closed) {
            finishRequest(input.requestId);
            break;
          }

          const result = await new Promise<IteratorResult<LocalModelEvent>>((resolve) => {
            request.waiters.push(resolve);
          });
          if (result.done) break;
          yield result.value;
        }
      } finally {
        input.signal?.removeEventListener("abort", abortHandler);
        cancel(input.requestId);
      }
    },
    terminate() {
      for (const workerSlot of workers) {
        workerSlot.worker.terminate();
      }
      workers.length = 0;
      pending.clear();
      clearLocalModelPoolDebug(options.pool);
    },
  };
};

const isStreamingEvent = (event: LocalModelEvent): boolean => {
  return (
    event.type === "text-delta" ||
    event.type === "reasoning-delta" ||
    event.type === "tool-call-args-delta"
  );
};
