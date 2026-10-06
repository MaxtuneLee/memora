import { afterEach, expect, test, vi } from "vite-plus/test";
import type { LocalModelEvent } from "../../../local-model-runtime/src/types";
import { createEmbeddingProgressReporter } from "../../../local-model-runtime/src/handlers/embeddingProgress";

afterEach(() => vi.useRealTimers());

test("reports worker heartbeats while loading and inference are pending and stops on completion", async () => {
  vi.useFakeTimers();
  const events: LocalModelEvent[] = [];
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const reporter = createEmbeddingProgressReporter(
    { emit: (event) => events.push(event), isCanceled: () => false },
    2,
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: "embedding-progress",
      stage: "loading-model",
      textCount: 2,
      elapsedMs: 5000,
    }),
  );
  reporter.running();
  const task = pending.finally(() => reporter.dispose());
  await vi.advanceTimersByTimeAsync(5000);
  expect(events).toContainEqual(
    expect.objectContaining({ type: "embedding-progress", stage: "running", elapsedMs: 10000 }),
  );
  finish?.();
  await task;
  const count = events.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(events).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});

test("a canceled worker stops its heartbeat even if inference has not returned", async () => {
  vi.useFakeTimers();
  let canceled = false;
  const events: LocalModelEvent[] = [];
  const reporter = createEmbeddingProgressReporter(
    { emit: (event) => events.push(event), isCanceled: () => canceled },
    1,
  );
  canceled = true;
  const count = events.length;
  await vi.advanceTimersByTimeAsync(15000);
  expect(events).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
  reporter.dispose();
});
