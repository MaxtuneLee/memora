import type { BeirRerankerProfile, LocalModelExecutionBackend } from "@memora/local-model-runtime";
import { BeirRerankerClient } from "./beirRerankerClient";

import { createModelWorkerFactory } from "../model-worker/factory";
import { BgeEmbeddingClient, type BgeWorkerUpdate } from "./bgeEmbeddingClient";

export const BEIR_EMBEDDING_MODEL = "bge-small-en" as const;
export const BEIR_EMBEDDING_DIMENSIONS = 384;

interface WorkerStats {
  workerId: number;
  backend: string | null;
  texts: number;
  inferenceMs: number;
}

export interface BeirWorkerProgress {
  workerId: number;
  phase: string;
  taskKind: "warmup" | "index" | "query";
  startIndex: number | null;
  batchSize: number;
  taskStartedAt: number;
  lastWorkerEventAt: number | null;
  completedTexts: number;
  backend: string | null;
}

export interface BeirEmbeddingPoolOptions {
  workerCount: number;
  rerankerProfile?: BeirRerankerProfile;
  onUpdate?: (workerId: number, update: BgeWorkerUpdate) => void;
  onProgress?: (
    state: BeirWorkerProgress,
    event: "dispatched" | "completed" | "failed" | "canceled" | BgeWorkerUpdate["type"],
  ) => void;
}

export interface BeirEmbeddingBatch {
  workerId: number;
  startIndex: number;
  vectors: Float32Array[];
}

type BatchResult =
  | { ok: true; batch: BeirEmbeddingBatch }
  | { ok: false; workerId: number; error: unknown };

export class BeirEmbeddingPool {
  private readonly workers: Array<{
    client: BgeEmbeddingClient;
    reranker: BeirRerankerClient;
    unmount: () => void;
    stats: WorkerStats;
    progress: BeirWorkerProgress;
  }> = [];
  private readonly controller = new AbortController();
  private readonly options: BeirEmbeddingPoolOptions;
  private warmed = false;
  private readonly queryWorkers = new Set<number>();

  constructor(options: BeirEmbeddingPoolOptions) {
    this.options = options;
    if (![1, 2, 4].includes(options.workerCount)) {
      throw new Error("Choose 1, 2 or 4 embedding workers.");
    }
    const session = crypto.randomUUID();
    try {
      for (let workerId = 0; workerId < options.workerCount; workerId += 1) {
        const factory = createModelWorkerFactory({
          pools: ["embedding"],
          workerNamePrefix: `memora-beir-${session}-${workerId}`,
          debug: false,
          mountVectorDb: false,
          extendedLifetime: false,
        });
        this.workers.push({
          client: new BgeEmbeddingClient(factory),
          reranker: new BeirRerankerClient(factory, options.rerankerProfile),
          unmount: factory.mount(),
          stats: { workerId, backend: null, texts: 0, inferenceMs: 0 },
          progress: {
            workerId,
            phase: "idle",
            taskKind: "warmup",
            startIndex: null,
            batchSize: 0,
            taskStartedAt: 0,
            lastWorkerEventAt: null,
            completedTexts: 0,
            backend: null,
          },
        });
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private async embedOnWorker(
    workerId: number,
    texts: string[],
    signal?: AbortSignal,
    recordStats = true,
    taskKind: BeirWorkerProgress["taskKind"] = "query",
    startIndex: number | null = null,
  ): Promise<Float32Array[]> {
    const taskSignal = signal
      ? AbortSignal.any([signal, this.controller.signal])
      : this.controller.signal;
    if (taskSignal.aborted) throw new Error("Canceled");
    const worker = this.workers[workerId];
    const start = performance.now();
    worker.progress = {
      ...worker.progress,
      phase: "dispatched",
      taskKind,
      startIndex,
      batchSize: texts.length,
      taskStartedAt: Date.now(),
      lastWorkerEventAt: null,
    };
    const publish = (
      event: Parameters<NonNullable<BeirEmbeddingPoolOptions["onProgress"]>>[1],
    ): void => {
      this.options.onProgress?.({ ...worker.progress }, event);
    };
    publish("dispatched");
    try {
      const vectors = await worker.client.embed(
        BEIR_EMBEDDING_MODEL,
        texts,
        (update) => {
          worker.progress.lastWorkerEventAt = Date.now();
          if (update.type === "backend") {
            worker.stats.backend = update.backend;
            worker.progress.backend = update.backend;
          } else if (update.type === "status") worker.progress.phase = update.status;
          else if (update.type === "embedding-progress") worker.progress.phase = update.stage;
          else if (update.type === "progress") worker.progress.phase = update.label;
          this.options.onUpdate?.(workerId, update);
          publish(update.type);
        },
        { signal: taskSignal, priority: "background" },
      );
      if (taskSignal.aborted) throw new Error("Canceled");
      if (vectors.length !== texts.length || vectors.some((v) => v.length !== BEIR_EMBEDDING_DIMENSIONS)) {
        throw new Error("BGE returned an incomplete embedding batch.");
      }
      if (vectors.some((v) => !v.every(Number.isFinite))) {
        throw new Error("BGE returned a non-finite embedding.");
      }
      if (recordStats) {
        worker.stats.texts += texts.length;
        worker.stats.inferenceMs += performance.now() - start;
      }
      worker.progress.phase = "completed";
      worker.progress.completedTexts = worker.stats.texts;
      publish("completed");
      return vectors;
    } catch (error) {
      worker.progress.phase = taskSignal.aborted ? "canceled" : "failed";
      publish(taskSignal.aborted ? "canceled" : "failed");
      throw error;
    }
  }

  progress(): BeirWorkerProgress[] {
    return this.workers.map((worker) => ({ ...worker.progress }));
  }

  async warmup(signal?: AbortSignal): Promise<void> {
    if (this.warmed) return;
    try {
      const warm = (id: number): Promise<Float32Array[]> =>
        this.embedOnWorker(id, ["Memora embedding warmup"], signal, false, "warmup");
      // Workers share one OPFS model cache but cannot see each other's downloads: a
      // worker can read a file another is still writing. Let the first worker finish
      // the download, then the rest load from the cache.
      await warm(0);
      await Promise.all(this.workers.slice(1).map((_, index) => warm(index + 1)));
      this.warmed = true;
    } catch (error) {
      this.controller.abort();
      throw error;
    }
  }

  // Keep one inference per worker in flight. Refill its slot before yielding so
  // inference can overlap the caller's serialized SQLite writes.
  async *embedBatches(
    texts: string[],
    batchSize: number,
    signal?: AbortSignal,
  ): AsyncGenerator<BeirEmbeddingBatch> {
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Invalid batch size.");
    const pending = new Map<number, Promise<BatchResult>>();
    let nextIndex = 0;
    const launch = (workerId: number): void => {
      if (nextIndex >= texts.length || signal?.aborted || this.controller.signal.aborted) return;
      const startIndex = nextIndex;
      nextIndex += batchSize;
      const task = this.embedOnWorker(
        workerId,
        texts.slice(startIndex, startIndex + batchSize),
        signal,
        true,
        "index",
        startIndex,
      )
        .then<BatchResult>((vectors) => ({ ok: true, batch: { workerId, startIndex, vectors } }))
        .catch<BatchResult>((error: unknown) => ({ ok: false, workerId, error }));
      pending.set(workerId, task);
    };
    try {
      for (let workerId = 0; workerId < this.workers.length; workerId += 1) launch(workerId);
      while (pending.size > 0) {
        const result = await Promise.race(pending.values());
        if (!result.ok) throw result.error;
        pending.delete(result.batch.workerId);
        launch(result.batch.workerId);
        yield result.batch;
      }
      if (signal?.aborted || this.controller.signal.aborted) throw new Error("Canceled");
    } finally {
      if (pending.size > 0) this.controller.abort();
    }
  }

  // The evaluator bounds concurrent queries to the pool size. Reuse whichever
  // worker is free, since query inference can finish out of order.
  async embed(
    texts: string[],
    signal?: AbortSignal,
    startIndex: number | null = null,
  ): Promise<Float32Array[]> {
    const workerId = this.workers.findIndex((_, id) => !this.queryWorkers.has(id));
    if (workerId < 0) throw new Error("All BEIR query embedding workers are busy.");
    this.queryWorkers.add(workerId);
    try {
      return await this.embedOnWorker(workerId, texts, signal, true, "query", startIndex);
    } finally {
      this.queryWorkers.delete(workerId);
    }
  }

  // Reranking leases the same independently named shared workers as query embedding.
  // The evaluator retains item order even when these slots complete out of order.
  async scorePair(
    query: string,
    document: string,
    device: LocalModelExecutionBackend,
    signal?: AbortSignal,
    startIndex: number | null = null,
    recordStats = true,
  ) {
    const workerId = this.workers.findIndex((_, id) => !this.queryWorkers.has(id));
    if (workerId < 0) throw new Error("All BEIR model workers are busy.");
    this.queryWorkers.add(workerId);
    const worker = this.workers[workerId];
    const taskSignal = signal
      ? AbortSignal.any([signal, this.controller.signal])
      : this.controller.signal;
    worker.progress = {
      ...worker.progress,
      phase: "dispatched",
      taskKind: "query",
      startIndex,
      batchSize: 1,
      taskStartedAt: Date.now(),
      lastWorkerEventAt: null,
    };
    this.options.onProgress?.({ ...worker.progress }, "dispatched");
    try {
      const result = await worker.reranker.score(query, document, device, taskSignal, (event) => {
        worker.progress.lastWorkerEventAt = Date.now();
        if (event.type === "backend") {
          worker.stats.backend = event.backend;
          worker.progress.backend = event.backend;
          this.options.onUpdate?.(workerId, event);
        } else if (event.type === "status") worker.progress.phase = event.status;
        else if (event.type === "model-progress")
          worker.progress.phase = event.file ?? "loading-model";
        this.options.onProgress?.(
          { ...worker.progress },
          event.type === "model-progress" ? "progress" : "status",
        );
      });
      if (recordStats) {
        worker.stats.texts++;
        worker.stats.inferenceMs += result.scoringMs;
      }
      worker.progress.phase = "completed";
      worker.progress.completedTexts = worker.stats.texts;
      this.options.onProgress?.({ ...worker.progress }, "completed");
      return { ...result, workerId };
    } catch (error) {
      worker.progress.phase = taskSignal.aborted ? "canceled" : "failed";
      this.options.onProgress?.({ ...worker.progress }, taskSignal.aborted ? "canceled" : "failed");
      throw error;
    } finally {
      this.queryWorkers.delete(workerId);
    }
  }

  async warmReranker(device: LocalModelExecutionBackend, signal?: AbortSignal) {
    return Promise.all(
      this.workers.map(() =>
        this.scorePair(
          "What is a panda?",
          "The giant panda is a bear native to China.",
          device,
          signal,
          null,
          false,
        ),
      ),
    );
  }

  stats(): WorkerStats[] {
    return this.workers.map((worker) => ({ ...worker.stats }));
  }

  dispose(): void {
    this.controller.abort();
    for (const worker of this.workers) worker.unmount();
  }
}
