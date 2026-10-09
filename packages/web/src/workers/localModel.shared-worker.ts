import { runLocalModelTask, setLocalModelAssetCache } from "@memora/local-model-runtime/worker";
import type { LocalModelTask } from "@memora/local-model-runtime";

import { opfsLocalModelAssetCache } from "./local-model/cache";
import { startSharedModelWorkerRuntime } from "./model-worker/sharedRuntime";
import { getModelWorkerPool } from "./model-worker/poolName";

interface NamedSharedWorkerScope {
  name: string;
}

const workerName = (self as unknown as NamedSharedWorkerScope).name;
const pool = getModelWorkerPool(workerName);
if (!pool) throw new Error(`Unknown shared model worker name: ${workerName}`);

setLocalModelAssetCache(opfsLocalModelAssetCache);
startSharedModelWorkerRuntime(pool, (task, context) =>
  runLocalModelTask(task, context.emit, context.isCanceled, context.stream),
);

export type SharedModelWorkerTask = LocalModelTask;
