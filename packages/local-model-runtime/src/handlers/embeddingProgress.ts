import type { SharedModelTaskContext } from "../sharedWorker";

export const createEmbeddingProgressReporter = (
  context: SharedModelTaskContext,
  textCount: number,
): { running: () => void; dispose: () => void } => {
  const started = performance.now();
  let stage: "loading-model" | "running" = "loading-model";
  const heartbeat = (): void => {
    if (context.isCanceled()) {
      clearInterval(timer);
      return;
    }
    context.emit({
      type: "embedding-progress",
      stage,
      elapsedMs: performance.now() - started,
      textCount,
    });
  };
  // Heartbeats report worker responsiveness, not an inference percentage.
  const timer = setInterval(heartbeat, 5000);
  context.emit({ type: "status", status: stage });
  heartbeat();
  return {
    running: () => {
      stage = "running";
      context.emit({ type: "status", status: stage });
      heartbeat();
    },
    dispose: () => clearInterval(timer),
  };
};
