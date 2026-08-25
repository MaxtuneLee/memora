export type BackgroundTaskPriority = "user" | "background";
export type BackgroundTaskState =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface BackgroundTask<TPayload = unknown> {
  id: string;
  kind: string;
  payload: TPayload;
  dedupeKey: string;
  priority: BackgroundTaskPriority;
  resourceGroup: string;
  state: BackgroundTaskState;
  attempt: number;
  maxAttempts: number;
  runAfter: number;
  dependsOn: string[];
  createdAt: number;
  updatedAt: number;
  error?: BackgroundTaskError;
}

export interface BackgroundTaskError {
  code: string;
  message: string;
  retryable: boolean;
  detail?: string;
}

export interface BackgroundTaskContext {
  signal: AbortSignal;
  task: BackgroundTask;
  reportProgress: (progress: { label: string; current?: number; total?: number }) => void;
  enqueue: <TPayload>(input: EnqueueTaskInput<TPayload>) => Promise<BackgroundTask<TPayload>>;
}

export interface BackgroundTaskHandler<TPayload = unknown> {
  kind: string;
  run: (payload: TPayload, context: BackgroundTaskContext) => Promise<void>;
}

export interface EnqueueTaskInput<TPayload> {
  kind: string;
  payload: TPayload;
  dedupeKey: string;
  priority?: BackgroundTaskPriority;
  resourceGroup?: string;
  maxAttempts?: number;
  runAfter?: number;
  dependsOn?: string[];
}

export interface BackgroundTaskStorage {
  load: () => Promise<BackgroundTask[]>;
  save: (tasks: BackgroundTask[]) => Promise<void>;
}
