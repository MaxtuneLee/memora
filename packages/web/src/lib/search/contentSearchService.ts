import type { file as LiveStoreFile } from "@/livestore/file";
import type { ContentLocator } from "@/lib/content/types";
import type { VectorDbClient, VectorDbSearchHit } from "@/lib/vector-db";
import { validateEmbeddings, type EmbeddingRuntime } from "@/lib/models/embeddingRuntime";

import { LEXICAL_INDEX_CONFIG } from "./searchIndexConfig";

export interface ContentSearchResult {
  fileId: string;
  fileName: string;
  fileMimeType: string;
  fileType: LiveStoreFile["type"];
  content: string;
  locator?: ContentLocator;
  score: number;
  chunkId: string;
}

const groupAdjacentHits = (hits: VectorDbSearchHit[]): VectorDbSearchHit[] => {
  const result: VectorDbSearchHit[] = [];
  for (const hit of hits) {
    const previous = result[result.length - 1];
    if (
      previous &&
      previous.documentId === hit.documentId &&
      previous.chunkIndex + 1 === hit.chunkIndex
    ) {
      previous.content = `${previous.content}\n\n${hit.content}`;
      previous.score = Math.max(previous.score, hit.score);
      continue;
    }
    result.push({ ...hit });
  }
  return result;
};

export const searchContent = async (input: {
  query: string;
  vectorDb: VectorDbClient;
  files: readonly LiveStoreFile[];
  topK?: number;
  fileIds?: readonly string[];
  signal?: AbortSignal;
  semantic?: EmbeddingRuntime | null;
}): Promise<ContentSearchResult[]> => {
  const query = input.query.trim();
  if (!query) return [];
  input.signal?.throwIfAborted();
  // Always retain the complete lexical index while the semantic index is being built.
  const activeFiles = input.files.filter((file) => !file.deletedAt && !file.purgedAt && (!input.fileIds || input.fileIds.includes(file.id)));
  if (!activeFiles.length) return [];
  const scope = { kind: "documents" as const, documentIds: activeFiles.map((file) => file.id) };
  const topK = Math.max(1, input.topK ?? 8);
  const lexical = await input.vectorDb.forIndex(LEXICAL_INDEX_CONFIG).search({
    query,
    scope,
    topK: 40,
    lexicalCandidateK: 40,
    semanticCandidateK: 0,
    semanticWeight: 0,
  });
  input.signal?.throwIfAborted();
  const semantic: VectorDbSearchHit[] = [];
  if (input.semantic) {
    const embeddings = await input.semantic.embed([query], "query", { signal: input.signal });
    input.signal?.throwIfAborted();
    validateEmbeddings(embeddings, 1, input.semantic.indexConfig.dimensions);
    semantic.push(...await input.vectorDb.forIndex(input.semantic.indexConfig).search({
      query, scope, topK: 40, lexicalCandidateK: 0, semanticCandidateK: 40,
      lexicalWeight: 0, semanticWeight: 1, queryEmbedding: embeddings[0],
    }));
  }
  input.signal?.throwIfAborted();
  const merged = new Map<string, VectorDbSearchHit>();
  for (const list of [lexical, semantic]) {
    list.forEach((hit, rank) => {
      const previous = merged.get(hit.chunkId);
      merged.set(hit.chunkId, { ...hit, score: (previous?.score ?? 0) + 1 / (60 + rank + 1) });
    });
  }
  const hits = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK);
  const filesById = new Map(activeFiles.map((file) => [file.id, file]));
  const results: ContentSearchResult[] = [];
  for (const hit of groupAdjacentHits(hits)) {
    const file = filesById.get(hit.documentId);
    if (!file) continue;
    results.push({
      fileId: file.id,
      fileName: file.name,
      fileMimeType: file.mimeType,
      fileType: file.type,
      content: hit.content,
      locator: hit.locator,
      score: hit.score,
      chunkId: hit.chunkId,
    });
  }
  return results;
};
