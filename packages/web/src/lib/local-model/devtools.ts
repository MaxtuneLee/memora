import type {
  LocalModelPoolKey,
  LocalModelPriority,
  LocalModelRuntime,
  LocalModelTask,
  LocalModelTaskStatus,
} from "@memora/local-model-runtime";

const IS_DEV = import.meta.env.DEV;

export interface LocalModelWorkerRuntimeLoad {
  family: string;
  modelId: string;
  adapter: string;
  runtime: LocalModelRuntime;
  loadedAt: number;
}

export interface LocalModelWorkerDebugState {
  id: number;
  pool: LocalModelPoolKey;
  createdAt: number;
  currentRequestId: string | null;
  currentTaskKind: LocalModelTask["kind"] | null;
  currentModelId: string | null;
  currentPriority: LocalModelPriority | null;
  currentStatus: LocalModelTaskStatus | null;
  activeSince: number | null;
  lastEventAt: number | null;
  lastCompletedAt: number | null;
  loadedRuntimes: LocalModelWorkerRuntimeLoad[];
}

export interface LocalModelPoolDebugState {
  pool: LocalModelPoolKey;
  workerCount: number;
  activeRequestCount: number;
  workers: LocalModelWorkerDebugState[];
}

export interface LocalModelDebugSnapshot {
  updatedAt: number;
  pools: Record<LocalModelPoolKey, LocalModelPoolDebugState>;
}

export interface LocalModelWorkerRuntimeDebugEvent {
  family: string;
  modelId: string;
  adapter: string;
  runtime: LocalModelRuntime;
}

const listeners = new Set<() => void>();
const emptyPool = (pool: LocalModelPoolKey): LocalModelPoolDebugState => ({
  pool,
  workerCount: 0,
  activeRequestCount: 0,
  workers: [],
});

let snapshot: LocalModelDebugSnapshot = {
  updatedAt: Date.now(),
  pools: {
    asr: emptyPool("asr"),
    chat: emptyPool("chat"),
    embedding: emptyPool("embedding"),
  },
};

const emitChange = (): void => {
  snapshot = { ...snapshot, updatedAt: Date.now() };
  listeners.forEach((listener) => {
    listener();
  });
};

const updatePool = (
  poolKey: LocalModelPoolKey,
  updater: (pool: LocalModelPoolDebugState) => LocalModelPoolDebugState,
): void => {
  if (!IS_DEV) return;

  snapshot = {
    ...snapshot,
    pools: {
      ...snapshot.pools,
      [poolKey]: updater(snapshot.pools[poolKey]),
    },
  };
  emitChange();
};

const computePool = (pool: LocalModelPoolDebugState): LocalModelPoolDebugState => {
  const workers = [...pool.workers].sort((left, right) => left.id - right.id);
  return {
    ...pool,
    workers,
    workerCount: workers.length,
    activeRequestCount: workers.filter((worker) => worker.currentRequestId !== null).length,
  };
};

const updateWorkerInPool = (
  poolKey: LocalModelPoolKey,
  workerId: number,
  updater: (worker: LocalModelWorkerDebugState | null) => LocalModelWorkerDebugState | null,
): void => {
  updatePool(poolKey, (pool) => {
    const currentWorkers = pool.workers;
    const index = currentWorkers.findIndex((worker) => worker.id === workerId);
    const currentWorker = index >= 0 ? currentWorkers[index] : null;
    const nextWorker = updater(currentWorker);

    if (!nextWorker && index < 0) {
      return pool;
    }

    let nextWorkers = currentWorkers;
    if (!nextWorker && index >= 0) {
      nextWorkers = currentWorkers.filter((worker) => worker.id !== workerId);
    } else if (nextWorker && index >= 0) {
      nextWorkers = currentWorkers.map((worker) => (worker.id === workerId ? nextWorker : worker));
    } else if (nextWorker) {
      nextWorkers = [...currentWorkers, nextWorker];
    }

    return computePool({
      ...pool,
      workers: nextWorkers,
    });
  });
};

const getTaskModelId = (task: LocalModelTask): string | null => {
  switch (task.kind) {
    case "asr.transcribe":
    case "chat.generate":
      return task.input.modelId;
    case "model.preload":
      return task.input.modelId;
    default:
      return null;
  }
};

export const getLocalModelDebugSnapshot = (): LocalModelDebugSnapshot => snapshot;

export const subscribeLocalModelDebugSnapshot = (listener: () => void): (() => void) => {
  if (!IS_DEV) {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const registerLocalModelWorker = (input: {
  pool: LocalModelPoolKey;
  workerId: number;
}): void => {
  updateWorkerInPool(input.pool, input.workerId, (worker) => {
    return (
      worker ?? {
        id: input.workerId,
        pool: input.pool,
        createdAt: Date.now(),
        currentRequestId: null,
        currentTaskKind: null,
        currentModelId: null,
        currentPriority: null,
        currentStatus: null,
        activeSince: null,
        lastEventAt: null,
        lastCompletedAt: null,
        loadedRuntimes: [],
      }
    );
  });
};

export const clearLocalModelPoolDebug = (pool: LocalModelPoolKey): void => {
  updatePool(pool, () => computePool(emptyPool(pool)));
};

export const assignLocalModelWorkerRequest = (input: {
  pool: LocalModelPoolKey;
  workerId: number;
  requestId: string;
  priority: LocalModelPriority;
  task: LocalModelTask;
}): void => {
  updateWorkerInPool(input.pool, input.workerId, (worker) => {
    if (!worker) return null;
    const now = Date.now();
    return {
      ...worker,
      currentRequestId: input.requestId,
      currentTaskKind: input.task.kind,
      currentModelId: getTaskModelId(input.task),
      currentPriority: input.priority,
      currentStatus: "assigned",
      activeSince: now,
      lastEventAt: now,
    };
  });
};

export const updateLocalModelWorkerStatus = (input: {
  pool: LocalModelPoolKey;
  requestId: string;
  status: LocalModelTaskStatus;
}): void => {
  updatePool(input.pool, (pool) => {
    const nextWorkers = pool.workers.map((worker) => {
      if (worker.currentRequestId !== input.requestId) {
        return worker;
      }

      const now = Date.now();
      const completed =
        input.status === "completed" || input.status === "aborted" || input.status === "failed";

      return {
        ...worker,
        currentStatus: completed ? null : input.status,
        currentRequestId: completed ? null : worker.currentRequestId,
        currentTaskKind: completed ? null : worker.currentTaskKind,
        currentModelId: completed ? worker.currentModelId : worker.currentModelId,
        currentPriority: completed ? null : worker.currentPriority,
        activeSince: completed ? null : worker.activeSince,
        lastEventAt: now,
        lastCompletedAt: completed ? now : worker.lastCompletedAt,
      };
    });

    return computePool({
      ...pool,
      workers: nextWorkers,
    });
  });
};

export const recordLocalModelWorkerRuntimeLoad = (input: {
  pool: LocalModelPoolKey;
  workerId: number;
  event: LocalModelWorkerRuntimeDebugEvent;
}): void => {
  updateWorkerInPool(input.pool, input.workerId, (worker) => {
    if (!worker) return null;

    const alreadyLoaded = worker.loadedRuntimes.some(
      (runtime) =>
        runtime.family === input.event.family &&
        runtime.modelId === input.event.modelId &&
        runtime.adapter === input.event.adapter,
    );

    if (alreadyLoaded) {
      return worker;
    }

    return {
      ...worker,
      lastEventAt: Date.now(),
      loadedRuntimes: [
        ...worker.loadedRuntimes,
        {
          ...input.event,
          loadedAt: Date.now(),
        },
      ],
    };
  });
};
