import { opfsResultStorage, type ResultStorage } from "./storage";

export interface ResumableEvaluationProgress<T> {
  completed: number;
  total: number;
  resumed: number;
  results: readonly T[];
}

export interface ResumableEvaluationOptions<Item, Result> {
  checkpointPath: string;
  fingerprint: string;
  items: readonly Item[];
  itemId: (item: Item, index: number) => string;
  evaluate: (item: Item, index: number, signal?: AbortSignal) => Promise<Result>;
  /** Maximum evaluations in flight. Results are still committed in item order. */
  concurrency?: number;
  storage?: Pick<ResultStorage, "write" | "readText" | "exists">;
  signal?: AbortSignal;
  initialResults?: readonly Result[];
  validateResult?: (result: unknown, item: Item, index: number) => Result;
  onProgress?: (progress: ResumableEvaluationProgress<Result>) => void | Promise<void>;
}

interface CheckpointManifest {
  formatVersion: 1;
  fingerprint: string;
  itemIds: string[];
  completed: number;
}

/** Ordered item journal. An item is durable before its cursor is advanced. */
export async function runResumableEvaluation<Item, Result>(
  options: ResumableEvaluationOptions<Item, Result>,
): Promise<Result[]> {
  const concurrency = options.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error("Evaluation concurrency must be a positive integer.");
  const storage = options.storage ?? opfsResultStorage;
  const itemIds = options.items.map(options.itemId);
  if (new Set(itemIds).size !== itemIds.length)
    throw new Error("Evaluation item IDs must be unique.");
  const manifestPath = `${options.checkpointPath}/manifest.json`;
  const itemPath = (index: number): string => `${options.checkpointPath}/items/${index}.json`;
  let manifest: CheckpointManifest = {
    formatVersion: 1,
    fingerprint: options.fingerprint,
    itemIds,
    completed: 0,
  };
  if (await storage.exists(manifestPath)) {
    const saved = JSON.parse(await storage.readText(manifestPath)) as CheckpointManifest;
    if (
      saved.formatVersion !== 1 ||
      saved.fingerprint !== options.fingerprint ||
      JSON.stringify(saved.itemIds) !== JSON.stringify(itemIds) ||
      !Number.isInteger(saved.completed) ||
      saved.completed < 0 ||
      saved.completed > itemIds.length
    ) {
      throw new Error("The evaluation checkpoint does not match these items or settings.");
    }
    manifest = saved;
  } else {
    await storage.write(manifestPath, JSON.stringify(manifest));
  }
  const results: Result[] = [];
  const validate = (value: unknown, index: number): Result =>
    options.validateResult
      ? options.validateResult(value, options.items[index], index)
      : (value as Result);
  // Read one item beyond the cursor too: a page may close after the item write
  // succeeds but before its manifest update reaches storage.
  for (let index = 0; index < itemIds.length; index += 1) {
    options.signal?.throwIfAborted();
    if (!(await storage.exists(itemPath(index)))) {
      if (index < manifest.completed)
        throw new Error(`Missing saved evaluation item ${itemIds[index]}.`);
      break;
    }
    const entry = JSON.parse(await storage.readText(itemPath(index))) as {
      itemId: string;
      fingerprint: string;
      result: unknown;
    };
    if (entry.itemId !== itemIds[index] || entry.fingerprint !== options.fingerprint)
      throw new Error(`Invalid saved evaluation item ${itemIds[index]}.`);
    results.push(validate(entry.result, index));
  }
  if ((options.initialResults?.length ?? 0) > itemIds.length)
    throw new Error("Too many initial evaluation results.");
  for (let index = results.length; index < (options.initialResults?.length ?? 0); index += 1) {
    options.signal?.throwIfAborted();
    const result = validate(options.initialResults?.[index], index);
    await storage.write(
      itemPath(index),
      JSON.stringify({ itemId: itemIds[index], fingerprint: options.fingerprint, result }),
    );
    results.push(result);
  }
  const resumed = results.length;
  manifest.completed = results.length;
  await storage.write(manifestPath, JSON.stringify(manifest));
  const publish = (): void | Promise<void> =>
    options.onProgress?.({
      completed: results.length,
      total: itemIds.length,
      resumed,
      results: [...results],
    });
  await publish();
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  type Outcome = { ok: true; result: Result } | { ok: false; error: unknown };
  const pending = new Map<number, Promise<Outcome>>();
  let nextIndex = results.length;
  const launch = (): void => {
    if (nextIndex >= options.items.length || signal.aborted) return;
    const index = nextIndex++;
    const task = Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return options.evaluate(options.items[index], index, signal);
      })
      .then<Outcome>((value) => ({ ok: true, result: validate(value, index) }))
      .catch<Outcome>((error: unknown) => {
        controller.abort(error);
        return { ok: false, error };
      });
    pending.set(index, task);
  };
  try {
    for (
      let slot = 0;
      slot < Math.min(concurrency, options.items.length - results.length);
      slot += 1
    )
      launch();
    for (let index = results.length; index < options.items.length; index += 1) {
      signal.throwIfAborted();
      // Abort promptly even if the adapter does not settle when canceled.
      const task = pending.get(index);
      if (!task) throw new Error("Missing scheduled evaluation item.");
      let abort: (() => void) | undefined;
      let outcome: Outcome;
      try {
        outcome = await Promise.race([
          task,
          new Promise<never>((_, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort();
          }),
        ]);
      } finally {
        if (abort) signal.removeEventListener("abort", abort);
      }
      if (!outcome.ok) throw outcome.error;
      signal.throwIfAborted();
      pending.delete(index);
      const result = outcome.result;
      await storage.write(
        itemPath(index),
        JSON.stringify({ itemId: itemIds[index], fingerprint: options.fingerprint, result }),
      );
      results.push(result);
      manifest.completed = results.length;
      await storage.write(manifestPath, JSON.stringify(manifest));
      await publish();
      signal.throwIfAborted();
      launch();
    }
    return results;
  } finally {
    controller.abort();
  }
}
