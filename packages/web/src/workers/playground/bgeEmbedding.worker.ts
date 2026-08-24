import { env, pipeline, type ProgressInfo } from "@huggingface/transformers";

import { configureTransformersCache } from "@/workers/local-model/cache";

type BgeEmbeddingModel = "bge-small-en" | "bge-m3";
type BgeExecutionBackend = "webgpu" | "wasm";

const MODELS: Record<BgeEmbeddingModel, { id: string; pooling: "mean" | "cls"; dtype: "q8" }> = {
  "bge-small-en": { id: "Xenova/bge-small-en-v1.5", pooling: "mean", dtype: "q8" },
  "bge-m3": { id: "Xenova/bge-m3", pooling: "cls", dtype: "q8" },
};

interface EmbedRequest {
  type: "embed";
  id: number;
  model: BgeEmbeddingModel;
  texts: string[];
}

type EmbeddingPipeline = (
  texts: string[],
  options: { pooling: "mean" | "cls"; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

env.allowLocalModels = false;
configureTransformersCache(env);

const extractors = new Map<BgeEmbeddingModel, EmbeddingPipeline>();
const extractorBackends = new Map<BgeEmbeddingModel, BgeExecutionBackend>();
const initializations = new Map<BgeEmbeddingModel, Promise<EmbeddingPipeline>>();

const postStatus = (label: string): void => {
  globalThis.postMessage({ type: "progress", label });
};

const postBackend = (backend: BgeExecutionBackend): void => {
  globalThis.postMessage({ type: "backend", backend });
};

const postProgress = (progress: ProgressInfo): void => {
  const item = progress as unknown as Record<string, unknown>;
  globalThis.postMessage({
    type: "progress",
    label: typeof item.file === "string" ? item.file : "Loading BGE model",
    progress: typeof item.progress === "number" ? item.progress / 100 : undefined,
  });
};

const loadExtractor = async (
  model: BgeEmbeddingModel,
  device: BgeExecutionBackend,
): Promise<EmbeddingPipeline> => {
  return (await pipeline("feature-extraction", MODELS[model].id, {
    device,
    dtype: MODELS[model].dtype,
    progress_callback: postProgress,
  })) as unknown as EmbeddingPipeline;
};

const getPreferredDevice = async (): Promise<BgeExecutionBackend> => {
  if (!navigator.gpu) return "wasm";
  try {
    return (await navigator.gpu.requestAdapter()) ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
};

const getExtractor = async (model: BgeEmbeddingModel): Promise<EmbeddingPipeline> => {
  const existing = extractors.get(model);
  if (existing) {
    const backend = extractorBackends.get(model);
    if (backend) postBackend(backend);
    return existing;
  }
  let initialization = initializations.get(model);
  if (!initialization) {
    initialization = (async () => {
      const device = await getPreferredDevice();
      try {
        const extractor = await loadExtractor(model, device);
        extractorBackends.set(model, device);
        return extractor;
      } catch (error) {
        if (device === "wasm") throw error;
        postStatus("WebGPU unavailable, continuing with WASM");
        const extractor = await loadExtractor(model, "wasm");
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
  if (backend) postBackend(backend);
  return extractor;
};

self.onmessage = async (event: MessageEvent<EmbedRequest>): Promise<void> => {
  const message = event.data;
  try {
    const currentExtractor = await getExtractor(message.model);
    const output = await currentExtractor(message.texts, {
      pooling: MODELS[message.model].pooling,
      normalize: true,
    });
    const values = output.data.slice();
    const dimension = output.dims.at(-1);
    if (!dimension || values.length % dimension !== 0) {
      throw new Error("BGE returned an invalid embedding shape.");
    }
    globalThis.postMessage({
      type: "result",
      id: message.id,
      dimension,
      values: Array.from(values),
    });
  } catch (error) {
    globalThis.postMessage({
      type: "error",
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
