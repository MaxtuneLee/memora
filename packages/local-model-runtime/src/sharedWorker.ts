import { normalizeLocalModelError } from "./errors";
import { getLocalModelManifest } from "./validation";
import { createLocalModelTaskQueue } from "./queue";
import type {
  LocalModelTaskSnapshot,
  LocalModelTaskStore,
  StoredModelWorkerEvent,
} from "./storage";
import type {
  LocalModelEvent,
  LocalModelPoolKey,
  LocalModelRequestEnvelope,
  LocalModelSequencedEventEnvelope,
  LocalModelSharedWorkerMessage,
  LocalModelTask,
  LocalModelTaskStatus,
} from "./types";

export interface SharedModelTaskContext {
  emit: (event: LocalModelEvent) => void;
  isCanceled: () => boolean;
}

export type SharedModelTaskRunner = (
  task: LocalModelTask,
  context: SharedModelTaskContext,
) => Promise<void>;

export interface SharedWorkerConnectScope {
  addEventListener: (type: "connect", listener: (event: MessageEvent) => void) => void;
}

interface RequestState {
  snapshot: LocalModelTaskSnapshot;
  subscribers: Set<MessagePort>;
  canceled: boolean;
  failed: boolean;
  replayEvents: LocalModelEvent[];
  replayIndex: number;
  replaying: boolean;
  persistChain: Promise<void>;
  persistTimer: ReturnType<typeof setTimeout> | null;
}

const SNAPSHOT_FLUSH_DELAY_MS = 200;

const getTaskPool = (task: LocalModelTask): LocalModelPoolKey | undefined => {
  switch (task.kind) {
    case "asr.transcribe":
      return "asr";
    case "chat.generate":
      return "chat";
    case "model.preload":
      return getLocalModelManifest(task.input.modelId)?.pool;
    case "embedding.generate":
      return "embedding";
    case "formula.preload":
    case "formula.recognize":
      return "formula";
  }
};

const isTerminalStatus = (event: LocalModelEvent): boolean => {
  return (
    event.type === "status" &&
    (event.status === "completed" || event.status === "failed" || event.status === "aborted")
  );
};

const isTerminalStatusValue = (status: LocalModelTaskStatus): boolean => {
  return status === "completed" || status === "failed" || status === "aborted";
};

const isReplayOutputEvent = (event: LocalModelEvent): boolean => {
  return event.type !== "status" && event.type !== "model-progress" && event.type !== "backend";
};

const eventsMatch = (left: LocalModelEvent, right: LocalModelEvent): boolean => {
  return JSON.stringify(left) === JSON.stringify(right);
};

export interface SharedModelWorkerRuntimeOptions {
  pool: LocalModelPoolKey;
  runTask: SharedModelTaskRunner;
  scope: SharedWorkerConnectScope;
  taskStore: LocalModelTaskStore;
}

export interface SharedModelWorkerRuntime {
  broadcast: (message: unknown) => void;
}

export const startSharedModelWorkerRuntime = ({
  pool,
  runTask,
  scope,
  taskStore,
}: SharedModelWorkerRuntimeOptions): SharedModelWorkerRuntime => {
  const requests = new Map<string, RequestState>();
  const ports = new Set<MessagePort>();
  const queue = createLocalModelTaskQueue();
  let activeRequestId: string | null = null;

  const enqueuePersist = (request: RequestState): Promise<void> => {
    request.persistChain = request.persistChain
      .catch(() => undefined)
      .then(() => taskStore.updateSnapshot(pool, request.snapshot));
    return request.persistChain;
  };

  const schedulePersist = (request: RequestState): void => {
    if (request.persistTimer !== null) return;
    request.persistTimer = setTimeout(() => {
      request.persistTimer = null;
      void enqueuePersist(request).catch((error) => {
        console.error(
          `Failed to persist model worker request ${request.snapshot.requestId}.`,
          error,
        );
      });
    }, SNAPSHOT_FLUSH_DELAY_MS);
  };

  const flushPersist = async (request: RequestState): Promise<void> => {
    if (request.persistTimer !== null) {
      clearTimeout(request.persistTimer);
      request.persistTimer = null;
    }
    await enqueuePersist(request);
  };

  const postStoredEvent = (port: MessagePort, requestId: string, item: StoredModelWorkerEvent) => {
    port.postMessage({
      type: "event",
      requestId,
      sequence: item.sequence,
      event: item.event,
    } satisfies LocalModelSequencedEventEnvelope);
  };

  const emit = (request: RequestState, event: LocalModelEvent): void => {
    const lastSequence = request.snapshot.events.at(-1)?.sequence ?? 0;
    const item: StoredModelWorkerEvent = { sequence: lastSequence + 1, event };
    request.snapshot.events.push(item);
    request.snapshot.updatedAt = Date.now();
    if (event.type === "status") request.snapshot.status = event.status;

    for (const port of request.subscribers) {
      postStoredEvent(port, request.snapshot.requestId, item);
    }

    if (isTerminalStatus(event)) {
      void flushPersist(request).catch((error) => {
        console.error(
          `Failed to persist model worker request ${request.snapshot.requestId}.`,
          error,
        );
      });
    } else {
      schedulePersist(request);
    }
  };

  const emitRuntimeEvent = (request: RequestState, event: LocalModelEvent): void => {
    if (request.canceled && !isTerminalStatus(event)) return;
    if (event.type === "error") request.failed = true;
    if (request.replaying && isReplayOutputEvent(event)) {
      const expected = request.replayEvents[request.replayIndex];
      if (expected && eventsMatch(expected, event)) {
        request.replayIndex += 1;
        if (request.replayIndex >= request.replayEvents.length) request.replaying = false;
        return;
      }
      request.replaying = false;
    }
    emit(request, event);
  };

  const dispatch = (): void => {
    if (activeRequestId !== null) return;
    const queued = queue.dequeue();
    if (!queued) return;

    const request = requests.get(queued.requestId);
    if (!request || request.canceled) {
      dispatch();
      return;
    }

    activeRequestId = queued.requestId;
    console.debug("[local-model-worker] assigned", {
      pool,
      requestId: queued.requestId,
      task: queued.task.kind,
      modelId: "input" in queued.task.input ? queued.task.input.modelId : undefined,
    });
    emit(request, { type: "status", status: "assigned" });
    void runTask(queued.task, {
      emit: (event) => emitRuntimeEvent(request, event),
      isCanceled: () => request.canceled,
    })
      .catch((error) => {
        console.error("[local-model-worker] task failed", {
          pool,
          requestId: queued.requestId,
          error,
        });
        emitRuntimeEvent(request, { type: "error", error: normalizeLocalModelError(error) });
        emit(request, { type: "status", status: "failed" });
      })
      .then(() => {
        if (!isTerminalStatusValue(request.snapshot.status)) {
          emit(request, {
            type: "status",
            status: request.canceled ? "aborted" : request.failed ? "failed" : "completed",
          });
        }
      })
      .finally(() => {
        activeRequestId = null;
        dispatch();
      });
  };

  const subscribe = (port: MessagePort, requestId: string, afterSequence: number): void => {
    const request = requests.get(requestId);
    if (!request) return;
    request.subscribers.add(port);
    for (const item of request.snapshot.events) {
      if (item.sequence > afterSequence) postStoredEvent(port, requestId, item);
    }
  };

  const handleRun = async (
    port: MessagePort,
    message: LocalModelRequestEnvelope,
  ): Promise<void> => {
    console.debug("[local-model-worker] received run", {
      pool,
      requestId: message.requestId,
      task: message.task.kind,
    });
    const existing = requests.get(message.requestId);
    if (existing) {
      subscribe(port, message.requestId, 0);
      return;
    }
    const taskPool = getTaskPool(message.task);
    if (message.task.kind === "model.preload" && !taskPool) {
      postStoredEvent(port, message.requestId, {
        sequence: 1,
        event: {
          type: "error",
          error: {
            code: "model-not-found",
            message: `Local model ${message.task.input.modelId} was not found.`,
          },
        },
      });
      postStoredEvent(port, message.requestId, {
        sequence: 2,
        event: { type: "status", status: "failed" },
      });
      return;
    }
    if (!taskPool) return;
    if (taskPool !== pool) {
      throw new Error(`Task ${message.task.kind} cannot run in the ${pool} model worker.`);
    }

    const now = Date.now();
    const snapshot: LocalModelTaskSnapshot = {
      requestId: message.requestId,
      priority: message.priority,
      task: message.task,
      status: "queued",
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    const request: RequestState = {
      snapshot,
      subscribers: new Set([port]),
      canceled: false,
      failed: false,
      replayEvents: [],
      replayIndex: 0,
      replaying: false,
      persistChain: Promise.resolve(),
      persistTimer: null,
    };
    requests.set(message.requestId, request);
    try {
      console.debug("[local-model-worker] snapshot write start", {
        pool,
        requestId: message.requestId,
      });
      await taskStore.createSnapshot(pool, snapshot);
      console.debug("[local-model-worker] snapshot write complete", {
        pool,
        requestId: message.requestId,
      });
      emit(request, { type: "status", status: "queued" });
      queue.enqueue(message);
      dispatch();
    } catch (error) {
      emit(request, { type: "error", error: normalizeLocalModelError(error) });
      emit(request, { type: "status", status: "failed" });
    }
  };

  const disconnect = (port: MessagePort): void => {
    ports.delete(port);
    for (const request of requests.values()) request.subscribers.delete(port);
  };

  const handleMessage = async (
    port: MessagePort,
    message: LocalModelSharedWorkerMessage,
  ): Promise<void> => {
    switch (message.type) {
      case "run":
        await handleRun(port, message);
        return;
      case "subscribe":
        subscribe(port, message.requestId, message.afterSequence);
        return;
      case "cancel": {
        const request = requests.get(message.requestId);
        if (!request || isTerminalStatusValue(request.snapshot.status)) {
          return;
        }
        request.canceled = true;
        queue.remove(message.requestId);
        emit(request, { type: "status", status: "aborted" });
        return;
      }
      case "acknowledge": {
        const request = requests.get(message.requestId);
        if (!request || !isTerminalStatusValue(request.snapshot.status)) {
          return;
        }
        await flushPersist(request);
        requests.delete(message.requestId);
        await taskStore.removeSnapshot(pool, message.requestId);
        return;
      }
      case "disconnect":
        disconnect(port);
        return;
    }
  };

  console.debug("[local-model-worker] snapshot restore start", { pool });
  const restorePromise = taskStore
    .readSnapshots(pool)
    .catch((error) => {
      console.error(`Failed to restore ${pool} model worker snapshots.`, error);
      return [];
    })
    .then((snapshots) => {
      console.debug("[local-model-worker] snapshot restore complete", {
        pool,
        count: snapshots.length,
      });
      for (const snapshot of snapshots) {
        const terminal =
          snapshot.status === "completed" ||
          snapshot.status === "failed" ||
          snapshot.status === "aborted";
        const replayEvents = terminal
          ? []
          : snapshot.events.map((item) => item.event).filter(isReplayOutputEvent);
        requests.set(snapshot.requestId, {
          snapshot,
          subscribers: new Set(),
          canceled: snapshot.status === "aborted",
          failed: false,
          replayEvents,
          replayIndex: 0,
          replaying: replayEvents.length > 0,
          persistChain: Promise.resolve(),
          persistTimer: null,
        });
        if (!terminal) {
          snapshot.status = "queued";
          queue.enqueue({
            requestId: snapshot.requestId,
            priority: snapshot.priority,
            task: snapshot.task,
          });
        }
      }
      dispatch();
    });

  scope.addEventListener("connect", (event: MessageEvent) => {
    const port = event.ports[0];
    if (!port) return;
    console.debug("[local-model-worker] port connected", { pool });
    ports.add(port);
    port.addEventListener(
      "message",
      (messageEvent: MessageEvent<LocalModelSharedWorkerMessage>) => {
        void restorePromise
          .then(() => handleMessage(port, messageEvent.data))
          .catch((error) => console.error("Shared model worker message failed.", error));
      },
    );
    port.start();
  });

  return {
    broadcast(message) {
      for (const port of ports) port.postMessage(message);
    },
  };
};
