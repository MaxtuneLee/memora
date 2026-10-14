import {
  AutoConfig,
  AutoModel,
  AutoProcessor,
  AutoTokenizer,
  env,
  pipeline,
  RawImage,
  type ProgressInfo,
  type Tensor,
} from "@huggingface/transformers";
import type { LocalEmbeddingModel, LocalModelExecutionBackend, LocalModelTask } from "../types";

import type { SharedModelTaskContext } from "../sharedWorker";
import { configureTransformersCache } from "../cache";
import { reportWorkerRuntimeLoaded } from "../debug";
import { createEmbeddingProgressReporter } from "./embeddingProgress";

const MODELS: Record<
  LocalEmbeddingModel,
  { id: string; pooling: "mean" | "cls"; dtype: "q8" | "q4" }
> = {
  "bge-small-en": { id: "Xenova/bge-small-en-v1.5", pooling: "mean", dtype: "q8" },
  "bge-m3": { id: "Xenova/bge-m3", pooling: "cls", dtype: "q8" },
  // Mean pooling and the 768d projection run inside the model graph.
  "embeddinggemma-2": { id: "onnx-community/embeddinggemma-2-ONNX", pooling: "mean", dtype: "q4" },
};

// The model context, matching the pipeline default that BGE gets from model_max_length.
const GEMMA_MAX_TOKENS = 8192;
// The model card warns that ONNX Runtime WebGPU kernels exceed a dispatch limit above ~2,700
// tokens per batch, so long inputs are split into padded sub-batches under this budget.
const GEMMA_BATCH_TOKEN_BUDGET = 2048;

type EmbeddingPipeline = (
  input: { texts: string[]; images?: Blob[] },
  options: { pooling: "mean" | "cls"; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

const concatVectors = (vectors: Float32Array[]): Float32Array => {
  const data = new Float32Array(vectors.reduce((sum, vector) => sum + vector.length, 0));
  let offset = 0;
  for (const vector of vectors) {
    data.set(vector, offset);
    offset += vector.length;
  }
  return data;
};

env.allowLocalModels = false;
configureTransformersCache(env);

const extractors = new Map<LocalEmbeddingModel, EmbeddingPipeline>();
const extractorBackends = new Map<LocalEmbeddingModel, LocalModelExecutionBackend>();
const initializations = new Map<LocalEmbeddingModel, Promise<EmbeddingPipeline>>();

const loadGemmaExtractor = async (
  device: LocalModelExecutionBackend,
  progress_callback: (progress: ProgressInfo) => void,
): Promise<EmbeddingPipeline> => {
  const { id, dtype } = MODELS["embeddinggemma-2"];
  const config = await AutoConfig.from_pretrained(id);
  // Text and image only (440M): the audio encoder is never downloaded or loaded.
  (config as unknown as { audio_config: unknown }).audio_config = null;
  const model = await AutoModel.from_pretrained(id, { config, device, dtype, progress_callback });
  const tokenizer = await AutoTokenizer.from_pretrained(id, { progress_callback });
  const processor = await AutoProcessor.from_pretrained(id, { progress_callback });
  const countTokens = (text: string): number =>
    Math.min(GEMMA_MAX_TOKENS, tokenizer.encode(text).length);
  const run = async (inputs: unknown): Promise<Tensor> =>
    ((await model(inputs as Record<string, Tensor>)) as { sentence_embedding: Tensor })
      .sentence_embedding;

  return async ({ texts, images }) => {
    const vectors: Float32Array[] = [];
    let dimension = 0;
    if (images) {
      // One image per call: 280 vision tokens by default, well under the WebGPU batch limit.
      for (const blob of images) {
        const embedding = await run(await processor(null, await RawImage.fromBlob(blob)));
        dimension = embedding.dims.at(-1) ?? 0;
        vectors.push(embedding.data as Float32Array);
      }
      return { data: concatVectors(vectors), dims: [images.length, dimension] };
    }
    for (let start = 0; start < texts.length;) {
      let end = start + 1;
      let longest = countTokens(texts[start] ?? "");
      while (end < texts.length) {
        const next = Math.max(longest, countTokens(texts[end] ?? ""));
        if (next * (end - start + 1) > GEMMA_BATCH_TOKEN_BUDGET) break;
        longest = next;
        end += 1;
      }
      const inputs = await tokenizer(texts.slice(start, end), {
        padding: true,
        truncation: true,
        max_length: GEMMA_MAX_TOKENS,
      });
      const embedding = await run(inputs);
      dimension = embedding.dims.at(-1) ?? 0;
      vectors.push(embedding.data as Float32Array);
      start = end;
    }
    return { data: concatVectors(vectors), dims: [texts.length, dimension] };
  };
};

const loadExtractor = async (
  model: LocalEmbeddingModel,
  device: LocalModelExecutionBackend,
  context: SharedModelTaskContext,
): Promise<EmbeddingPipeline> => {
  const progress_callback = (progress: ProgressInfo) => {
    const item = progress as unknown as Record<string, unknown>;
    context.emit({
      type: "model-progress",
      file: typeof item.file === "string" ? item.file : "Loading embedding model",
      progress: typeof item.progress === "number" ? item.progress / 100 : undefined,
    });
  };
  if (model === "embeddinggemma-2") return loadGemmaExtractor(device, progress_callback);
  const extractor = (await pipeline("feature-extraction", MODELS[model].id, {
    device,
    dtype: MODELS[model].dtype,
    progress_callback,
  })) as unknown as (
    texts: string[],
    options: { pooling: "mean" | "cls"; normalize: boolean },
  ) => Promise<{ data: Float32Array; dims: number[] }>;
  return async ({ texts, images }, options) => {
    if (images) throw new Error(`${MODELS[model].id} cannot embed images.`);
    return extractor(texts, options);
  };
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
    family: model === "embeddinggemma-2" ? "gemma" : "bge",
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
  const { texts, images } = task.input;
  const progress = createEmbeddingProgressReporter(context, images?.length ?? texts.length);
  try {
    const extractor = await getExtractor(task.input.model, context);
    if (context.isCanceled()) return;

    progress.running();
    const output = await extractor(images?.length ? { texts: [], images } : { texts }, {
      pooling: task.input.pooling ?? MODELS[task.input.model].pooling,
      normalize: true,
    });
    if (context.isCanceled()) return;

    const values = output.data.slice();
    const dimension = output.dims.at(-1);
    if (!dimension || values.length % dimension !== 0) {
      throw new Error("The embedding model returned an invalid embedding shape.");
    }
    context.emit({ type: "embedding-complete", dimension, values: Array.from(values) });
  } finally {
    progress.dispose();
  }
};
