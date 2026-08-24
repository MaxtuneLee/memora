import { dir as opfsDir, file as opfsFile, write as opfsWrite } from "@memora/fs";
import type {
  LocalModelEvent,
  LocalModelPoolKey,
  LocalModelPriority,
  LocalModelTask,
  LocalModelTaskStatus,
} from "@memora/local-model-runtime";

export interface StoredModelWorkerEvent {
  sequence: number;
  event: LocalModelEvent;
}

export interface ModelWorkerSnapshot {
  requestId: string;
  priority: LocalModelPriority;
  task: LocalModelTask;
  status: LocalModelTaskStatus;
  events: StoredModelWorkerEvent[];
  createdAt: number;
  updatedAt: number;
}

interface PersistedSnapshotState {
  requestId: string;
  priority: LocalModelPriority;
  status: LocalModelTaskStatus;
  events: StoredModelWorkerEvent[];
  createdAt: number;
  updatedAt: number;
}

type PersistedTask =
  | Exclude<LocalModelTask, { kind: "asr.transcribe" } | { kind: "formula.recognize" }>
  | {
      kind: "asr.transcribe";
      input: Omit<Extract<LocalModelTask, { kind: "asr.transcribe" }>["input"], "audio"> & {
        audioLength: number;
      };
    }
  | {
      kind: "formula.recognize";
      input: { mimeType: string };
    };

const SNAPSHOT_ROOT = "/model-worker-snapshots";
const TASK_FILE = "task.json";
const STATE_FILE = "state.json";
const BINARY_FILE = "input.bin";

const getRequestDirectory = (pool: LocalModelPoolKey, requestId: string): string => {
  return `${SNAPSHOT_ROOT}/${pool}/${encodeURIComponent(requestId)}`;
};

const getTaskPath = (pool: LocalModelPoolKey, requestId: string): string => {
  return `${getRequestDirectory(pool, requestId)}/${TASK_FILE}`;
};

const getStatePath = (pool: LocalModelPoolKey, requestId: string): string => {
  return `${getRequestDirectory(pool, requestId)}/${STATE_FILE}`;
};

const getBinaryPath = (pool: LocalModelPoolKey, requestId: string): string => {
  return `${getRequestDirectory(pool, requestId)}/${BINARY_FILE}`;
};

const persistTask = async (
  pool: LocalModelPoolKey,
  requestId: string,
  task: LocalModelTask,
): Promise<void> => {
  let persistedTask: PersistedTask;
  if (task.kind === "asr.transcribe") {
    await opfsWrite(getBinaryPath(pool, requestId), task.input.audio, { overwrite: true });
    const { audio: _audio, ...input } = task.input;
    persistedTask = {
      kind: task.kind,
      input: { ...input, audioLength: task.input.audio.length },
    };
  } else if (task.kind === "formula.recognize") {
    await opfsWrite(getBinaryPath(pool, requestId), task.input.blob, { overwrite: true });
    persistedTask = {
      kind: task.kind,
      input: { mimeType: task.input.blob.type },
    };
  } else {
    persistedTask = task;
  }

  await opfsWrite(getTaskPath(pool, requestId), JSON.stringify(persistedTask), {
    overwrite: true,
  });
};

const restoreTask = async (pool: LocalModelPoolKey, requestId: string): Promise<LocalModelTask> => {
  const task = JSON.parse(await opfsFile(getTaskPath(pool, requestId)).text()) as PersistedTask;
  if (task.kind === "asr.transcribe") {
    const buffer = await opfsFile(getBinaryPath(pool, requestId)).arrayBuffer();
    const audio = new Float32Array(buffer);
    if (audio.length !== task.input.audioLength) {
      throw new Error(`Invalid audio snapshot for request ${requestId}.`);
    }
    const { audioLength: _audioLength, ...input } = task.input;
    return { kind: task.kind, input: { ...input, audio } };
  }
  if (task.kind === "formula.recognize") {
    const buffer = await opfsFile(getBinaryPath(pool, requestId)).arrayBuffer();
    return {
      kind: task.kind,
      input: { blob: new Blob([buffer], { type: task.input.mimeType }) },
    };
  }
  return task;
};

export const writeModelWorkerSnapshotTask = async (
  pool: LocalModelPoolKey,
  snapshot: ModelWorkerSnapshot,
): Promise<void> => {
  await persistTask(pool, snapshot.requestId, snapshot.task);
  await writeModelWorkerSnapshotState(pool, snapshot);
};

export const writeModelWorkerSnapshotState = async (
  pool: LocalModelPoolKey,
  snapshot: ModelWorkerSnapshot,
): Promise<void> => {
  const state: PersistedSnapshotState = {
    requestId: snapshot.requestId,
    priority: snapshot.priority,
    status: snapshot.status,
    events: snapshot.events,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
  await opfsWrite(getStatePath(pool, snapshot.requestId), JSON.stringify(state), {
    overwrite: true,
  });
};

export const readModelWorkerSnapshots = async (
  pool: LocalModelPoolKey,
): Promise<ModelWorkerSnapshot[]> => {
  const poolDirectory = opfsDir(`${SNAPSHOT_ROOT}/${pool}`);
  if (!(await poolDirectory.exists())) return [];

  const entries = await poolDirectory.children();
  const snapshots: ModelWorkerSnapshot[] = [];
  for (const entry of entries) {
    if (entry.kind !== "dir") continue;
    try {
      const state = JSON.parse(
        await opfsFile(`${entry.path}/${STATE_FILE}`).text(),
      ) as PersistedSnapshotState;
      snapshots.push({
        ...state,
        task: await restoreTask(pool, state.requestId),
      });
    } catch (error) {
      console.warn(`Ignoring invalid model worker snapshot at ${entry.path}.`, error);
    }
  }
  return snapshots;
};

export const removeModelWorkerSnapshot = async (
  pool: LocalModelPoolKey,
  requestId: string,
): Promise<void> => {
  await opfsDir(getRequestDirectory(pool, requestId)).remove({
    recursive: true,
    force: true,
  });
};
