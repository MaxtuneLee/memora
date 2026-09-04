import type {
  LocalModelEvent,
  LocalModelManifest,
  LocalModelPoolKey,
  LocalModelPriority,
  LocalModelTask,
  LocalModelTaskStatus,
} from "./types";

export interface StoredModelWorkerEvent {
  sequence: number;
  event: LocalModelEvent;
}

export interface LocalModelTaskSnapshot {
  requestId: string;
  priority: LocalModelPriority;
  task: LocalModelTask;
  status: LocalModelTaskStatus;
  events: StoredModelWorkerEvent[];
  createdAt: number;
  updatedAt: number;
}

export interface LocalModelTaskStore {
  readSnapshots: (pool: LocalModelPoolKey) => Promise<LocalModelTaskSnapshot[]>;
  createSnapshot: (pool: LocalModelPoolKey, snapshot: LocalModelTaskSnapshot) => Promise<void>;
  updateSnapshot: (pool: LocalModelPoolKey, snapshot: LocalModelTaskSnapshot) => Promise<void>;
  removeSnapshot: (pool: LocalModelPoolKey, requestId: string) => Promise<void>;
}

export interface LocalModelAssetCache {
  match: (request: string) => Promise<Response | undefined>;
  put: (request: string, response: Response) => Promise<void>;
  removeModel: (manifest: Pick<LocalModelManifest, "modelId">) => Promise<void>;
}
