import type { LocalModelPoolKey } from "@memora/local-model-runtime";

export const getModelWorkerPool = (workerName: string): LocalModelPoolKey | null => {
  const separator = workerName.lastIndexOf("-");
  if (separator < 1) return null;
  const pool = workerName.slice(separator + 1);
  if (pool === "asr" || pool === "chat" || pool === "embedding" || pool === "formula") return pool;
  return null;
};
