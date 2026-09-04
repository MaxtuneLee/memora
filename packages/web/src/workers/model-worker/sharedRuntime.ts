import {
  startSharedModelWorkerRuntime as startRuntime,
  type LocalModelPoolKey,
  type SharedModelTaskRunner,
} from "@memora/local-model-runtime";

import { setWorkerDebugReporter } from "../local-model/debug";
import { opfsLocalModelTaskStore } from "./snapshotStore";

export type { SharedModelTaskContext, SharedModelTaskRunner } from "@memora/local-model-runtime";

export const startSharedModelWorkerRuntime = (
  pool: LocalModelPoolKey,
  runTask: SharedModelTaskRunner,
): void => {
  const runtime = startRuntime({
    pool,
    runTask,
    scope: self,
    taskStore: opfsLocalModelTaskStore,
  });
  if (import.meta.env.DEV) setWorkerDebugReporter(runtime.broadcast);
};
