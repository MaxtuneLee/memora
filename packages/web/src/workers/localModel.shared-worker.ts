import { runLocalModelTask, setLocalModelAssetCache } from "@memora/local-model-runtime/worker";
import type { LocalModelPoolKey, LocalModelTask } from "@memora/local-model-runtime";

import { opfsLocalModelAssetCache } from "./local-model/cache";
import { startSharedModelWorkerRuntime } from "./model-worker/sharedRuntime";

const WORKER_POOL_BY_NAME = {
  "memora-model-asr": "asr",
  "memora-model-chat": "chat",
  "memora-model-embedding": "embedding",
  "memora-model-formula": "formula",
} as const satisfies Record<string, LocalModelPoolKey>;

interface NamedSharedWorkerScope {
  name: string;
}

const workerName = (self as unknown as NamedSharedWorkerScope).name;
const pool = WORKER_POOL_BY_NAME[workerName as keyof typeof WORKER_POOL_BY_NAME];
if (!pool) throw new Error(`Unknown shared model worker name: ${workerName}`);

setLocalModelAssetCache(opfsLocalModelAssetCache);
startSharedModelWorkerRuntime(pool, (task, context) =>
  runLocalModelTask(task, context.emit, context.isCanceled),
);

export type SharedModelWorkerTask = LocalModelTask;
