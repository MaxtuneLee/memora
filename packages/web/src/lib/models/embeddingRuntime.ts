import { bgeEmbeddingClient, type BgeEmbeddingClient } from "@/lib/playground/bgeEmbeddingClient";
import { buildBgeIndexConfig } from "@/lib/playground/vectorDbConfig";
import { LEXICAL_INDEX_CONFIG } from "@/lib/search/searchIndexConfig";
import type { VectorDbIndexConfig } from "@/lib/vector-db";
import { parseFeatureModelRoute, type ModelTarget } from "./modelRouting";

export interface EmbeddingRuntime {
  indexConfig: VectorDbIndexConfig;
  embed(texts: string[], purpose: "query" | "document", options?: {
    signal?: AbortSignal;
    onProgress?: (progress: { label: string; current?: number; total?: number }) => void;
  }): Promise<Float32Array[]>;
}

export const validateEmbeddings = (
  embeddings: Float32Array[], count: number, dimensions: number,
): void => {
  if (embeddings.length !== count || embeddings.some((vector) =>
    vector.length !== dimensions || !vector.every(Number.isFinite) || !vector.some((value) => value !== 0),
  )) throw new Error("The embedding model returned invalid vectors. Rebuild the index after checking the selected model.");
};

export const createEmbeddingRuntime = (
  target: ModelTarget,
  client: Pick<BgeEmbeddingClient, "embed"> = bgeEmbeddingClient,
): EmbeddingRuntime => {
  const route = parseFeatureModelRoute("embedding", target);
  if (!route || route.source !== "local" || (route.modelId !== "bge-m3" && route.modelId !== "bge-small-en")) {
    // No remote adapter or automatic fallback until cloud content upload is authorized.
    throw new Error("Cloud embeddings are not available yet. Choose a local embedding model or disable semantic search.");
  }
  const model = route.modelId;
  const modelConfig = buildBgeIndexConfig(model, LEXICAL_INDEX_CONFIG.chunkSize);
  const indexConfig: VectorDbIndexConfig = {
    ...LEXICAL_INDEX_CONFIG,
    model: `local:${modelConfig.model}`,
    modelRevision: `${modelConfig.modelRevision}:q8:content-v1`,
    dimensions: modelConfig.dimensions,
    pooling: modelConfig.pooling,
    queryPrefix: modelConfig.queryPrefix,
    documentPrefix: modelConfig.documentPrefix,
  };
  return {
    indexConfig,
    async embed(texts, purpose, options = {}) {
      options.signal?.throwIfAborted();
      if (texts.length === 0) return [];
      const prefix = purpose === "query" ? indexConfig.queryPrefix : indexConfig.documentPrefix;
      const result = await client.embed(model, texts.map((text) => `${prefix}${text}`), (update) => {
        if (update.type === "progress") options.onProgress?.({ label: update.label });
      }, { priority: purpose === "query" ? "interactive" : "background", signal: options.signal });
      options.signal?.throwIfAborted();
      validateEmbeddings(result, texts.length, indexConfig.dimensions);
      return result;
    },
  };
};
