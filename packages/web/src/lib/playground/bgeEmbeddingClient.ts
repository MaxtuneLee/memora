export interface BgeWorkerProgress {
  type: "progress";
  label: string;
  progress?: number;
}

export type BgeEmbeddingModel = "bge-small-en" | "bge-m3";
export type BgeExecutionBackend = "webgpu" | "wasm";

export interface BgeWorkerBackend {
  type: "backend";
  backend: BgeExecutionBackend;
}

interface BgeWorkerResult {
  type: "result";
  id: number;
  dimension: number;
  values: number[];
}

interface BgeWorkerError {
  type: "error";
  id: number;
  error: string;
}

type BgeWorkerResponse = BgeWorkerProgress | BgeWorkerBackend | BgeWorkerResult | BgeWorkerError;
export type BgeWorkerUpdate = BgeWorkerProgress | BgeWorkerBackend;

interface PendingEmbedding {
  resolve: (vectors: Float32Array[]) => void;
  reject: (error: Error) => void;
  onUpdate?: (update: BgeWorkerUpdate) => void;
}

export class BgeEmbeddingClient {
  private readonly worker = new Worker(
    new URL("../../workers/playground/bgeEmbedding.worker.ts", import.meta.url),
    { type: "module" },
  );
  private readonly pending = new Map<number, PendingEmbedding>();
  private nextRequestId = 1;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<BgeWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress" || message.type === "backend") {
        this.pending.forEach((pending) => pending.onUpdate?.(message));
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.type === "error") {
        pending.reject(new Error(message.error));
        return;
      }

      const values = Float32Array.from(message.values);
      const vectors = Array.from({ length: values.length / message.dimension }, (_, index) => {
        return values.slice(index * message.dimension, (index + 1) * message.dimension);
      });
      pending.resolve(vectors);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "The BGE worker stopped unexpectedly.");
      this.pending.forEach((pending) => pending.reject(error));
      this.pending.clear();
    };
  }

  embed(
    model: BgeEmbeddingModel,
    texts: string[],
    onUpdate?: (update: BgeWorkerUpdate) => void,
  ): Promise<Float32Array[]> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onUpdate });
      this.worker.postMessage({ type: "embed", id, model, texts });
    });
  }

  dispose(): void {
    this.pending.forEach((pending) => pending.reject(new Error("BGE worker was closed.")));
    this.pending.clear();
    this.worker.terminate();
  }
}
