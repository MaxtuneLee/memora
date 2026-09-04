import { env, pipeline, type ProgressInfo } from "@huggingface/transformers";
import type { LocalEmbeddingModel, LocalModelExecutionBackend, LocalModelTask } from "../types";

import type { SharedModelTaskContext } from "../sharedWorker";
import { configureTransformersCache } from "../cache";
import { reportWorkerRuntimeLoaded } from "../debug";

const MODELS: Record<LocalEmbeddingModel, { id: string; pooling: "mean" | "cls"; dtype: "q8" }> = {
  "bge-small-en": { id: "Xenova/bge-small-en-v1.5", pooling: "mean", dtype: "q8" },
  "bge-m3": { id: "Xenova/bge-m3", pooling: "cls", dtype: "q8" },
};

type EmbeddingPipeline = (
  texts: string[],
  options: { pooling: "mean" | "cls"; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

env.allowLocalModels = false;
configureTransformersCache(env);

const extractors = new Map<LocalEmbeddingModel, EmbeddingPipeline>();
const extractorBackends = new Map<LocalEmbeddingModel, LocalModelExecutionBackend>();
const initializations = new Map<LocalEmbeddingModel, Promise<EmbeddingPipeline>>();

const loadExtractor = async (
  model: LocalEmbeddingModel,
  device: LocalModelExecutionBackend,
  context: SharedModelTaskContext,
): Promise<EmbeddingPipeline> => {
  return (await pipeline("feature-extraction", MODELS[model].id, {
    device,
    dtype: MODELS[model].dtype,
    progress_callback: (progress: ProgressInfo) => {
      const item = progress as unknown as Record<string, unknown>;
      context.emit({
        type: "model-progress",
        file: typeof item.file === "string" ? item.file : "Loading BGE model",
        progress: typeof item.progress === "number" ? item.progress / 100 : undefined,
      });
    },
  })) as unknown as EmbeddingPipeline;
};

const getPreferredDevice = async (): Promise<LocalModelExecutionBackend> => {
  if (!navigator.gpu) return "wasm";
  try {
    return (await navigator.gpu.requestAdapter()) ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
};

const getExtractor = async (
  model: LocalEmbeddingModel,
  context: SharedModelTaskContext,
): Promise<EmbeddingPipeline> => {
  const existing = extractors.get(model);
  if (existing) {
    const backend = extractorBackends.get(model);
    if (backend) context.emit({ type: "backend", backend });
    return existing;
  }

  let initialization = initializations.get(model);
  if (!initialization) {
    initialization = (async () => {
      const device = await getPreferredDevice();
      try {
        const extractor = await loadExtractor(model, device, context);
        extractorBackends.set(model, device);
        return extractor;
      } catch (error) {
        if (device === "wasm") throw error;
        context.emit({ type: "model-progress", file: "WebGPU unavailable, using WASM" });
        const extractor = await loadExtractor(model, "wasm", context);
        extractorBackends.set(model, "wasm");
        return extractor;
      }
    })().catch((error) => {
      initializations.delete(model);
      throw error;
    });
    initializations.set(model, initialization);
  }

  const extractor = await initialization;
  extractors.set(model, extractor);
  const backend = extractorBackends.get(model);
  if (backend) context.emit({ type: "backend", backend });
  reportWorkerRuntimeLoaded({
    family: "bge",
    modelId: MODELS[model].id,
    adapter: "feature-extraction",
    runtime: "transformers-js",
  });
  return extractor;
};

export const runEmbeddingTask = async (
  task: Extract<LocalModelTask, { kind: "embedding.generate" }>,
  context: SharedModelTaskContext,
): Promise<void> => {
  context.emit({ type: "status", status: "loading-model" });
  const extractor = await getExtractor(task.input.model, context);
  if (context.isCanceled()) return;

  context.emit({ type: "status", status: "running" });
  const output = await extractor(task.input.texts, {
    pooling: MODELS[task.input.model].pooling,
    normalize: true,
  });
  if (context.isCanceled()) return;

  const values = output.data.slice();
  const dimension = output.dims.at(-1);
  if (!dimension || values.length % dimension !== 0) {
    throw new Error("BGE returned an invalid embedding shape.");
  }
  context.emit({
    type: "embedding-complete",
    dimension,
    values: Array.from(values),
  });
};
