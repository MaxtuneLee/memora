import type { LocalModelPoolKey, LocalModelTask } from "@memora/local-model-runtime";

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

startSharedModelWorkerRuntime(pool, async (task, context) => {
  switch (task.kind) {
    case "asr.transcribe":
    case "chat.generate":
    case "model.preload": {
      const { runLocalModelTask } = await import("./local-model/runtime");
      await runLocalModelTask(task, context.emit, context.isCanceled);
      return;
    }
    case "embedding.generate": {
      const { runEmbeddingTask } = await import("./local-model/embedding");
      await runEmbeddingTask(task, context);
      return;
    }
    case "formula.preload":
    case "formula.recognize": {
      const { runFormulaTask } = await import("./local-model/formula");
      await runFormulaTask(task, context);
      return;
    }
    default:
      task satisfies never;
  }
});

export type SharedModelWorkerTask = LocalModelTask;
