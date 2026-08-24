import type {
  LocalEmbeddingEvent,
  LocalEmbeddingModel,
  LocalModelExecutionBackend,
} from "@memora/local-model-runtime";

import { modelWorkerFactory, type ModelWorkerFactory } from "@/lib/model-worker";

export interface BgeWorkerProgress {
  type: "progress";
  label: string;
  progress?: number;
}

export type BgeEmbeddingModel = LocalEmbeddingModel;
export type BgeExecutionBackend = LocalModelExecutionBackend;

export interface BgeWorkerBackend {
  type: "backend";
  backend: BgeExecutionBackend;
}

export type BgeWorkerUpdate = BgeWorkerProgress | BgeWorkerBackend;

export class BgeEmbeddingClient {
  private readonly workerFactory: ModelWorkerFactory;

  constructor(workerFactory: ModelWorkerFactory = modelWorkerFactory) {
    this.workerFactory = workerFactory;
  }

  async embed(
    model: BgeEmbeddingModel,
    texts: string[],
    onUpdate?: (update: BgeWorkerUpdate) => void,
  ): Promise<Float32Array[]> {
    let result: Extract<LocalEmbeddingEvent, { type: "embedding-complete" }> | null = null;
    for await (const event of this.workerFactory.run("embedding", {
      priority: "interactive",
      task: { kind: "embedding.generate", input: { model, texts } },
    }) as AsyncGenerator<LocalEmbeddingEvent>) {
      if (event.type === "backend") {
        onUpdate?.(event);
      } else if (event.type === "model-progress") {
        onUpdate?.({
          type: "progress",
          label: event.file ?? "Loading BGE model",
          progress: event.progress,
        });
      } else if (event.type === "error") {
        throw new Error(event.error.message);
      } else if (event.type === "embedding-complete") {
        result = event;
      }
    }

    if (!result) throw new Error("The BGE shared worker returned no embedding result.");
    const values = Float32Array.from(result.values);
    return Array.from({ length: values.length / result.dimension }, (_, index) => {
      return values.slice(index * result.dimension, (index + 1) * result.dimension);
    });
  }
}

export const bgeEmbeddingClient = new BgeEmbeddingClient();
