import type { VectorDbIndexConfig } from "@/lib/vector-db";

export const LEXICAL_INDEX_CONFIG: VectorDbIndexConfig = {
  model: "lexical-only",
  modelRevision: "v1",
  dimensions: 1024,
  metric: "cosine",
  normalized: true,
  pooling: "none",
  queryPrefix: "",
  documentPrefix: "",
  chunkerName: "segment-window",
  chunkerVersion: "segment-window-v1",
  chunkSize: 420,
  chunkOverlap: 60,
  segmenterLocale: "zh",
  segmenterPipelineVersion: "fts-v1",
};
