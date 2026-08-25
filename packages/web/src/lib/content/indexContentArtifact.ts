import type { VectorDbClient, VectorDbIndexedChunk } from "@/lib/vector-db";

import { chunkContentArtifact } from "./chunkDocument";
import type { ContentArtifact } from "./types";

export const indexContentArtifactLexically = async (
  vectorDb: VectorDbClient,
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
