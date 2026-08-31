import type { VectorDbIndexClient, VectorDbIndexedChunk } from "@/lib/vector-db";
import { validateEmbeddings, type EmbeddingRuntime } from "@/lib/models/embeddingRuntime";

import { chunkContentArtifact } from "./chunkDocument";
import type { ContentArtifact } from "./types";

export const indexContentArtifactLexically = async (
  vectorDb: VectorDbIndexClient,
  artifact: ContentArtifact,
): Promise<{ chunkCount: number }> => {
  const chunks = await chunkContentArtifact(artifact);
  const plan = {
    documentId: artifact.fileId,
    contentHash: artifact.sourceRevision,
    indexedAt: Date.now(),
    chunks: chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      contentHash: chunk.contentHash,
    })),
  };
  const checkpoint = await vectorDb.prepareDocument(plan);
  if (checkpoint.complete) return { chunkCount: chunks.length };
  const pending = new Set(checkpoint.persistedChunkIds);
  const batch: VectorDbIndexedChunk[] = chunks
    .filter((chunk) => !pending.has(chunk.chunkId))
    .map((chunk) => ({
      ...chunk,
      locator: chunk.locator,
    }));
  if (batch.length > 0) {
    await vectorDb.upsertChunkBatch({
      documentId: artifact.fileId,
      contentHash: artifact.sourceRevision,
      chunks: batch,
    });
  }
  await vectorDb.finalizeDocument(plan);
  return { chunkCount: chunks.length };
};

export const indexContentArtifactSemantically = async (
  vectorDb: VectorDbIndexClient,
  artifact: ContentArtifact,
  runtime: EmbeddingRuntime,
  options: { signal?: AbortSignal; onProgress?: (progress: { label: string; current?: number; total?: number }) => void } = {},
): Promise<{ chunkCount: number }> => {
  options.signal?.throwIfAborted();
  const chunks = await chunkContentArtifact(artifact, { size: runtime.indexConfig.chunkSize, overlap: runtime.indexConfig.chunkOverlap });
  const plan = {
    documentId: artifact.fileId,
    contentHash: artifact.sourceRevision,
    indexedAt: Date.now(),
    chunks: chunks.map(({ chunkId, chunkIndex, contentHash }) => ({ chunkId, chunkIndex, contentHash })),
  };
  const checkpoint = await vectorDb.prepareDocument(plan);
  if (checkpoint.complete) return { chunkCount: chunks.length };
  const persisted = new Set(checkpoint.persistedChunkIds);
  const pending = chunks.filter((chunk) => !persisted.has(chunk.chunkId));
  for (let offset = 0; offset < pending.length; offset += 8) {
    options.signal?.throwIfAborted();
    const batch = pending.slice(offset, offset + 8);
    const embeddings = await runtime.embed(batch.map((chunk) => chunk.content), "document", options);
    options.signal?.throwIfAborted();
    validateEmbeddings(embeddings, batch.length, runtime.indexConfig.dimensions);
    await vectorDb.upsertChunkBatch({ documentId: artifact.fileId, contentHash: artifact.sourceRevision,
      chunks: batch.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] })),
    });
    options.onProgress?.({ label: "Indexing semantic content", current: chunks.length - pending.length + offset + batch.length, total: chunks.length });
  }
  options.signal?.throwIfAborted();
  await vectorDb.finalizeDocument(plan);
  return { chunkCount: chunks.length };
};
