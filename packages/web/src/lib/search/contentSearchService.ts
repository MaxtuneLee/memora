import type { file as LiveStoreFile } from "@/livestore/file";
import type { ContentLocator } from "@/lib/content/types";
import type { VectorDbClient, VectorDbSearchHit } from "@/lib/vector-db";

import { LEXICAL_INDEX_CONFIG } from "./searchIndexConfig";

export interface ContentSearchResult {
  fileId: string;
  fileName: string;
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
}): Promise<ContentSearchResult[]> => {
  const query = input.query.trim();
  if (!query) return [];
  await input.vectorDb.initialize(LEXICAL_INDEX_CONFIG);
  const hits = await input.vectorDb.search({
    query,
    scope: input.fileIds ? { kind: "documents", documentIds: [...input.fileIds] } : { kind: "all" },
    topK: Math.max(1, input.topK ?? 8),
    lexicalCandidateK: 40,
    semanticCandidateK: 0,
    semanticWeight: 0,
  });
  const filesById = new Map(input.files.map((file) => [file.id, file]));
  const results: ContentSearchResult[] = [];
  for (const hit of groupAdjacentHits(hits)) {
    const file = filesById.get(hit.documentId);
    if (!file) continue;
    results.push({
      fileId: file.id,
      fileName: file.name,
      content: hit.content,
      locator: hit.locator,
      score: hit.score,
      chunkId: hit.chunkId,
    });
  }
  return results;
};
