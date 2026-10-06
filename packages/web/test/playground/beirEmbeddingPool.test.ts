import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  factories: [] as Array<{ workerNamePrefix?: string; pools?: readonly string[] }>,
  active: 0,
  peak: 0,
  disposed: 0,
  calls: [] as Array<{ workerId: number; texts: string[] }>,
  poolings: [] as Array<string | undefined>,
  fail: false,
}));

vi.mock("../../src/lib/model-worker/factory", () => ({
  createModelWorkerFactory: (options: { workerNamePrefix?: string; pools?: readonly string[] }) => {
    const workerId = state.factories.length;
    state.factories.push(options);
    return {
      workerId,
      async *run(
        _pool: string,
        options: {
          signal: AbortSignal;
          task: { kind: string; input: { document: string; device: "wasm" | "webgpu" } };
        },
      ) {
        expect(options.task.kind).toBe("reranker.score");
        state.active++;
        state.peak = Math.max(state.peak, state.active);
        state.calls.push({ workerId, texts: [options.task.input.document] });
        try {
          yield { type: "backend", backend: options.task.input.device };
          options.signal.throwIfAborted();
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, workerId === 0 ? 15 : 1);
            options.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new Error("Canceled"));
              },
              { once: true },
            );
          });
          yield {
            type: "reranker-complete",
            backend: options.task.input.device,
            logit: Number(options.task.input.document),
            scoringMs: 5,
          };
        } finally {
          state.active--;
        }
      },
      mount: () => () => {
        state.disposed += 1;
      },
    };
  },
}));

vi.mock("../../src/lib/playground/bgeEmbeddingClient", () => ({
  BgeEmbeddingClient: class {
    private readonly factory: { workerId: number };
    constructor(factory: { workerId: number }) {
      this.factory = factory;
    }
    async embed(
      _model: string,
      texts: string[],
      update: (u: { type: "backend"; backend: "webgpu" }) => void,
      options: { signal: AbortSignal; pooling?: string },
    ) {
      const workerId = this.factory.workerId;
      state.poolings.push(options.pooling);
      state.calls.push({ workerId, texts });
      state.active += 1;
      state.peak = Math.max(state.peak, state.active);
      try {
        update({ type: "backend", backend: "webgpu" });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, workerId === 0 ? 15 : 1);
          options.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("Canceled"));
            },
            { once: true },
          );
        });
        if (state.fail && texts.includes("bad")) throw new Error("Inference failed");
        return texts.map((t) => new Float32Array(384).fill(Number(t) || 0));
      } finally {
        state.active -= 1;
      }
    }
  },
}));

import {
  BeirEmbeddingPool,
  type BeirWorkerProgress,
} from "../../src/lib/playground/beirEmbeddingPool";

beforeEach(() => {
  state.factories = [];
  state.calls = [];
  state.poolings = [];
  state.active = 0;
  state.peak = 0;
  state.disposed = 0;
  state.fail = false;
});
afterEach(() => vi.restoreAllMocks());

test("dispatches distinct batches concurrently and keeps vectors paired with their documents", async () => {
  const pool = new BeirEmbeddingPool({ workerCount: 2 });
  const results = new Map<number, number>();
  try {
    for await (const batch of pool.embedBatches(["1", "2", "3", "4", "5", "6", "7"], 2)) {
      batch.vectors.forEach((vector, i) => results.set(batch.startIndex + i, vector[0]));
    }
    expect(state.peak).toBe(2);
    expect([...results.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ]);
    expect(state.calls.flatMap((c) => c.texts).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(pool.stats().reduce((n, s) => n + s.texts, 0)).toBe(7);
    expect(new Set(state.factories.map((f) => f.workerNamePrefix)).size).toBe(2);
    expect(state.factories.every((f) => f.pools?.join() === "embedding")).toBe(true);
  } finally {
    pool.dispose();
  }
  expect(state.disposed).toBe(2);
});

test("prefetches the next inference while the consumer writes the previous batch", async () => {
  const pool = new BeirEmbeddingPool({ workerCount: 1 });
  const iterator = pool.embedBatches(["1", "2"], 1);
  try {
    const first = await iterator.next();
    expect(first.value?.startIndex).toBe(0);
    expect(state.calls.map((c) => c.texts)).toEqual([["1"], ["2"]]);
    await iterator.next();
    expect((await iterator.next()).done).toBe(true);
  } finally {
    pool.dispose();
  }
});

test("warms every worker once without counting warmup text as benchmark documents", async () => {
  const pool = new BeirEmbeddingPool({ workerCount: 2 });
  try {
    await pool.warmup();
    await pool.warmup();
    expect(state.calls).toHaveLength(2);
    expect(state.poolings).toEqual(["cls", "cls"]);
    expect(pool.stats().every((s) => s.backend === "webgpu" && s.texts === 0)).toBe(true);
  } finally {
    pool.dispose();
  }
});

test("stops parallel work on cancellation", async () => {
  const pool = new BeirEmbeddingPool({ workerCount: 2 });
  const controller = new AbortController();
  const iterator = pool.embedBatches(["1", "2", "3", "4"], 1, controller.signal);
  try {
    const first = iterator.next();
    controller.abort();
    await expect(first).rejects.toThrow("Canceled");
    expect(state.calls).toHaveLength(2);
  } finally {
    pool.dispose();
  }
});

test("an inference error fails the batch instead of dropping documents", async () => {
  state.fail = true;
  const pool = new BeirEmbeddingPool({ workerCount: 2 });
  try {
    const consume = async () => {
      for await (const _batch of pool.embedBatches(["1", "bad", "3"], 1)) {
        /* Consume actual scheduled batches. */
      }
    };
    await expect(consume()).rejects.toThrow("Inference failed");
  } finally {
    pool.dispose();
  }
});

test("reports dispatched and completed batch identities on the main thread", async () => {
  const events: Array<{ state: BeirWorkerProgress; event: string }> = [];
  const pool = new BeirEmbeddingPool({
    workerCount: 2,
    onProgress: (state, event) => events.push({ state, event }),
  });
  try {
    const iterator = pool.embedBatches(["1", "2", "3"], 2);
    const first = iterator.next();
    expect(
      events
        .filter((e) => e.event === "dispatched")
        .map((e) => [e.state.workerId, e.state.startIndex, e.state.batchSize]),
    ).toEqual([
      [0, 0, 2],
      [1, 2, 1],
    ]);
    expect(events.some((e) => e.event === "completed")).toBe(false);
    await first;
    while (!(await iterator.next()).done) {
      /* Drain remaining batches. */
    }
    expect(
      events
        .filter((e) => e.event === "completed")
        .map((e) => e.state.completedTexts)
        .sort((a, b) => a - b),
    ).toEqual([1, 2]);
    expect(
      pool.progress().every((s) => s.phase === "completed" && s.lastWorkerEventAt !== null),
    ).toBe(true);
  } finally {
    pool.dispose();
  }
});

test("runs queries on distinct workers and reuses a worker that finishes early", async () => {
  const events: BeirWorkerProgress[] = [];
  const pool = new BeirEmbeddingPool({
    workerCount: 2,
    onProgress: (progress, event) => {
      if (event === "dispatched") events.push(progress);
    },
  });
  try {
    const first = pool.embed(["1"], undefined, 0);
    const second = pool.embed(["2"], undefined, 1);
    expect((await second)[0][0]).toBe(2);
    expect((await pool.embed(["3"], undefined, 2))[0][0]).toBe(3);
    expect((await first)[0][0]).toBe(1);
    expect(state.peak).toBe(2);
    expect(state.calls.map((call) => call.workerId)).toEqual([0, 1, 1]);
    expect(events.map((event) => [event.taskKind, event.startIndex])).toEqual([
      ["query", 0],
      ["query", 1],
      ["query", 2],
    ]);
  } finally {
    pool.dispose();
  }
});

test("cancels concurrent query inference on every worker", async () => {
  const pool = new BeirEmbeddingPool({ workerCount: 2 });
  const controller = new AbortController();
  try {
    const queries = Promise.all([
      pool.embed(["1"], controller.signal),
      pool.embed(["2"], controller.signal),
    ]);
    controller.abort();
    await expect(queries).rejects.toThrow("Canceled");
    expect(state.calls.map((call) => call.workerId)).toEqual([0, 1]);
    expect(state.active).toBe(0);
  } finally {
    pool.dispose();
  }
});

test("reranking reuses distinct shared workers, preserves pair identities and reports actual replies", async () => {
  const events: Array<{ state: BeirWorkerProgress; event: string }> = [];
  const pool = new BeirEmbeddingPool({
    workerCount: 2,
    onProgress: (state, event) => events.push({ state, event }),
  });
  try {
    const first = pool.scorePair("question", "1", "wasm", undefined, 0);
    const second = pool.scorePair("question", "2", "wasm", undefined, 1);
    expect(
      events
        .filter((e) => e.event === "dispatched")
        .every((e) => e.state.lastWorkerEventAt === null),
    ).toBe(true);
    expect((await second).logit).toBe(2);
    expect((await pool.scorePair("question", "3", "wasm", undefined, 2)).workerId).toBe(1);
    expect((await first).logit).toBe(1);
    expect(state.peak).toBe(2);
    expect(state.calls.map((c) => c.workerId)).toEqual([0, 1, 1]);
    expect(pool.stats().reduce((sum, s) => sum + s.texts, 0)).toBe(3);
    expect(pool.progress().every((s) => s.lastWorkerEventAt !== null)).toBe(true);
  } finally {
    pool.dispose();
  }
});

test("canceling reranking stops all shared worker leases", async () => {
  const pool = new BeirEmbeddingPool({ workerCount: 2 });
  const controller = new AbortController();
  try {
    const scoring = Promise.all([
      pool.scorePair("q", "1", "wasm", controller.signal),
      pool.scorePair("q", "2", "wasm", controller.signal),
    ]);
    controller.abort();
    await expect(scoring).rejects.toThrow(/Canceled|aborted/);
    expect(state.active).toBe(0);
  } finally {
    pool.dispose();
  }
});
