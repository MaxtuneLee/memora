import { expect, test, vi } from "vitest";
import { runResumableEvaluation } from "../src/resumable";
import { MemoryResultStorage } from "./fixtures";

const items = ["q1", "q2", "q3"];
const base = {
  checkpointPath: "/evaluations/run/dataset/method",
  fingerprint: "dataset-and-model-v1",
  items,
  itemId: (id: string) => id,
};

test("reopens at the next query after cancellation without rerunning completed items", async () => {
  const storage = new MemoryResultStorage();
  const controller = new AbortController();
  const evaluate = vi.fn(async (item: string) => item + " result");
  await expect(
    runResumableEvaluation({
      ...base,
      storage,
      evaluate,
      signal: controller.signal,
      onProgress: ({ completed }) => {
        if (completed === 1) controller.abort();
      },
    }),
  ).rejects.toThrow();
  expect(evaluate.mock.calls.map(([id]) => id)).toEqual(["q1"]);
  const result = await runResumableEvaluation({ ...base, storage, evaluate });
  expect(evaluate.mock.calls.map(([id]) => id)).toEqual(items);
  expect(result).toEqual(items.map((id) => id + " result"));
});

test("recovers an item written just before its cursor update fails", async () => {
  const storage = new MemoryResultStorage();
  const write = storage.write.bind(storage);
  let failCursor = true;
  storage.write = async (path, body) => {
    if (failCursor && path.endsWith("manifest.json") && JSON.parse(body).completed === 2) {
      failCursor = false;
      throw new Error("Disconnected");
    }
    await write(path, body);
  };
  const evaluate = vi.fn(async (item: string) => item);
  await expect(runResumableEvaluation({ ...base, storage, evaluate })).rejects.toThrow(
    "Disconnected",
  );
  const result = await runResumableEvaluation({ ...base, storage, evaluate });
  expect(result).toEqual(items);
  expect(evaluate.mock.calls.map(([id]) => id)).toEqual(items);
});

test("rejects changed item order or model fingerprints before evaluating", async () => {
  const storage = new MemoryResultStorage();
  await runResumableEvaluation({ ...base, storage, evaluate: async (item) => item });
  const evaluate = vi.fn(async (item: string) => item);
  await expect(
    runResumableEvaluation({ ...base, storage, evaluate, fingerprint: "different-model" }),
  ).rejects.toThrow("does not match");
  await expect(
    runResumableEvaluation({ ...base, storage, evaluate, items: [...items].reverse() }),
  ).rejects.toThrow("does not match");
  expect(evaluate).not.toHaveBeenCalled();
});

test("migrates legacy partial results and fails on missing committed item files", async () => {
  const storage = new MemoryResultStorage();
  const evaluate = vi.fn(async (item: string) => item);
  const result = await runResumableEvaluation({
    ...base,
    storage,
    evaluate,
    initialResults: ["q1"],
  });
  expect(result).toEqual(items);
  expect(evaluate.mock.calls.map(([id]) => id)).toEqual(["q2", "q3"]);
  await storage.write(
    base.checkpointPath + "/manifest.json",
    JSON.stringify({
      formatVersion: 1,
      fingerprint: base.fingerprint,
      itemIds: items,
      completed: 3,
    }),
  );
  const broken = {
    write: storage.write.bind(storage),
    readText: storage.readText.bind(storage),
    exists: async (path: string) => (path.endsWith("items/1.json") ? false : storage.exists(path)),
  };
  await expect(runResumableEvaluation({ ...base, storage: broken, evaluate })).rejects.toThrow(
    "Missing saved",
  );
});

test("bounds concurrent evaluations and commits out-of-order completions in item order", async () => {
  const storage = new MemoryResultStorage();
  const releases = new Map<string, (result: string) => void>();
  const evaluate = vi.fn(
    (item: string) => new Promise<string>((resolve) => releases.set(item, resolve)),
  );
  const progress: string[][] = [];
  const run = runResumableEvaluation({
    ...base,
    storage,
    evaluate,
    concurrency: 2,
    onProgress: ({ results }) => {
      progress.push([...results]);
    },
  });
  await vi.waitFor(() => expect(evaluate.mock.calls.map(([id]) => id)).toEqual(["q1", "q2"]));
  releases.get("q2")?.("q2 result");
  await Promise.resolve();
  expect(progress).toEqual([[]]);
  releases.get("q1")?.("q1 result");
  await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(3));
  releases.get("q3")?.("q3 result");
  await expect(run).resolves.toEqual(items.map((id) => id + " result"));
  expect(progress).toEqual([
    [],
    ["q1 result"],
    ["q1 result", "q2 result"],
    items.map((id) => id + " result"),
  ]);
  const resumed = vi.fn(async (item: string) => item);
  await expect(
    runResumableEvaluation({ ...base, storage, evaluate: resumed, concurrency: 4 }),
  ).resolves.toEqual(items.map((id) => id + " result"));
  expect(resumed).not.toHaveBeenCalled();
});

test("cancels outstanding parallel work and resumes only after durable items", async () => {
  const storage = new MemoryResultStorage();
  const controller = new AbortController();
  let inflightSignal: AbortSignal | undefined;
  const evaluate = vi.fn(async (item: string, _index: number, signal?: AbortSignal) => {
    if (item === "q1") return item;
    inflightSignal = signal;
    return new Promise<string>(() => {});
  });
  await expect(
    runResumableEvaluation({
      ...base,
      storage,
      evaluate,
      concurrency: 2,
      signal: controller.signal,
      onProgress: ({ completed }) => {
        if (completed === 1) controller.abort();
      },
    }),
  ).rejects.toThrow();
  expect(inflightSignal?.aborted).toBe(true);
  expect(evaluate.mock.calls.map(([id]) => id)).toEqual(["q1", "q2"]);
  const resumed = vi.fn(async (item: string) => item);
  await expect(
    runResumableEvaluation({ ...base, storage, evaluate: resumed, concurrency: 2 }),
  ).resolves.toEqual(items);
  expect(resumed.mock.calls.map(([id]) => id)).toEqual(["q2", "q3"]);
});

test("a later concurrent failure aborts a stuck earlier item without dispatching more work", async () => {
  const storage = new MemoryResultStorage();
  let inflightSignal: AbortSignal | undefined;
  const evaluate = vi.fn(async (item: string, _index: number, signal?: AbortSignal) => {
    if (item === "q2") throw new Error("Inference failed");
    inflightSignal = signal;
    return new Promise<string>(() => {});
  });
  await expect(
    runResumableEvaluation({ ...base, storage, evaluate, concurrency: 2 }),
  ).rejects.toThrow("Inference failed");
  expect(inflightSignal?.aborted).toBe(true);
  expect(evaluate.mock.calls.map(([id]) => id)).toEqual(["q1", "q2"]);
});

test.each([0, -1, 1.5, NaN, Infinity])(
  "rejects invalid concurrency %s before writing a checkpoint",
  async (concurrency) => {
    const storage = new MemoryResultStorage();
    const write = vi.spyOn(storage, "write");
    await expect(
      runResumableEvaluation({ ...base, storage, concurrency, evaluate: async (item) => item }),
    ).rejects.toThrow("positive integer");
    expect(write).not.toHaveBeenCalled();
  },
);
