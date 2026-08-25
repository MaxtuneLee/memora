import type { BgeEmbeddingModel } from "./bgeEmbeddingClient";
import type { VectorDbIndexConfig } from "../vector-db";

export const DEFAULT_BGE_MODEL: BgeEmbeddingModel = "bge-small-en";
export const DEFAULT_BGE_CHUNK_SIZE = 420;

export const BGE_SMALL_EN_QUERY_PREFIX =
  "Represent this sentence for searching relevant passages: ";

const BGE_INDEX_CONFIG: Record<
  BgeEmbeddingModel,
  { dimensions: number; pooling: "mean" | "cls"; revision: string }
> = {
  "bge-small-en": {
    dimensions: 384,
    pooling: "mean",
    revision: "Xenova/bge-small-en-v1.5",
  },
  "bge-m3": {
    dimensions: 1024,
    pooling: "cls",
    revision: "Xenova/bge-m3",
  },
};

export const buildBgeIndexConfig = (
  model: BgeEmbeddingModel,
  chunkSize: number,
): VectorDbIndexConfig => {
  const modelConfig = BGE_INDEX_CONFIG[model];
  return {
    model,
    modelRevision: modelConfig.revision,
    dimensions: modelConfig.dimensions,
    metric: "cosine",
    normalized: true,
    pooling: modelConfig.pooling,
    queryPrefix: model === "bge-small-en" ? BGE_SMALL_EN_QUERY_PREFIX : "",
    documentPrefix: "",
    chunkerName: "transcript-characters",
    chunkerVersion: "1",
    chunkSize,
    chunkOverlap: 0,
    segmenterLocale: "und",
    segmenterPipelineVersion: "1",
  };
};
