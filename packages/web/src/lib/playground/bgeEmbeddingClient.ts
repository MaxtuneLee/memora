import type {
  LocalEmbeddingEvent,
  LocalEmbeddingModel,
  LocalEmbeddingRequest,
  LocalModelExecutionBackend,
  LocalModelPriority,
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

export type BgeWorkerUpdate =
  | BgeWorkerProgress
  | BgeWorkerBackend
  | (Extract<LocalEmbeddingEvent, { type: "status" }> & { label: string })
  | (Extract<LocalEmbeddingEvent, { type: "embedding-progress" }> & { label: string });

interface EmbeddingRunOptions {
  priority?: LocalModelPriority;
  signal?: AbortSignal;
  pooling?: "mean" | "cls";
}

export class BgeEmbeddingClient {
  private readonly workerFactory: Pick<ModelWorkerFactory, "run">;

  constructor(workerFactory: Pick<ModelWorkerFactory, "run"> = modelWorkerFactory) {
    this.workerFactory = workerFactory;
  }

  embed(
    model: BgeEmbeddingModel,
    texts: string[],
    onUpdate?: (update: BgeWorkerUpdate) => void,
    options: EmbeddingRunOptions = {},
  ): Promise<Float32Array[]> {
    return this.run({ model, texts, pooling: options.pooling }, onUpdate, options);
  }

  // One vector per image, in the same space as text. Only embeddinggemma-2 supports images.
  // fallow-ignore-next-line unused-class-member -- Called by createEmbeddingRuntime in lib/models/embeddingRuntime.ts.
  embedImages(
    model: BgeEmbeddingModel,
    images: Blob[],
    onUpdate?: (update: BgeWorkerUpdate) => void,
    options: EmbeddingRunOptions = {},
  ): Promise<Float32Array[]> {
    return this.run({ model, texts: [], images }, onUpdate, options);
  }

  private async run(
    input: LocalEmbeddingRequest,
    onUpdate: ((update: BgeWorkerUpdate) => void) | undefined,
    options: EmbeddingRunOptions,
  ): Promise<Float32Array[]> {
    let result: Extract<LocalEmbeddingEvent, { type: "embedding-complete" }> | null = null;
    for await (const event of this.workerFactory.run("embedding", {
      priority: options.priority ?? "interactive",
      task: { kind: "embedding.generate", input },
      signal: options.signal,
    }) as AsyncGenerator<LocalEmbeddingEvent>) {
      if (event.type === "backend") {
        onUpdate?.(event);
      } else if (event.type === "status" || event.type === "embedding-progress") {
        onUpdate?.({ ...event, label: event.type === "status" ? event.status : event.stage });
      } else if (event.type === "model-progress") {
        onUpdate?.({
          type: "progress",
          label: event.file ?? "Loading embedding model",
          progress: event.progress,
        });
      } else if (event.type === "error") {
        throw new Error(
          event.error.detail ? `${event.error.message} ${event.error.detail}` : event.error.message,
        );
      } else if (event.type === "embedding-complete") {
        result = event;
      }
    }

    if (!result) throw new Error("The embedding shared worker returned no embedding result.");
    const values = Float32Array.from(result.values);
    return Array.from({ length: values.length / result.dimension }, (_, index) => {
      return values.slice(index * result.dimension, (index + 1) * result.dimension);
    });
  }
}

export const bgeEmbeddingClient = new BgeEmbeddingClient();
