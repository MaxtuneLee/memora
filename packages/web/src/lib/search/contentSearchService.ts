import type { file as LiveStoreFile } from "@/livestore/file";
import type { ContentLocator } from "@/lib/content/types";
import type { VectorDbClient, VectorDbSearchHit } from "@/lib/vector-db";
import { validateEmbeddings, type EmbeddingRuntime } from "@/lib/models/embeddingRuntime";

import { LEXICAL_INDEX_CONFIG } from "./searchIndexConfig";
import type { SemanticSearchMode } from "@/livestore/setting";

export interface ContentSearchResult {
  fileId: string;
  fileName: string;
  fileMimeType: string;
  fileType: LiveStoreFile["type"];
  content: string;
  locator?: ContentLocator;
  score: number;
  chunkId: string;
  /** Set for image files: the picture to preview. */
  imagePath?: string;
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

// EmbeddingGemma puts every chunk within a narrow cosine-distance band of any query (about 0.29-0.40),
// and a nearest-neighbor search always returns something. Two filters keep only real matches:
// - Very short chunks ("Open", a lone heading) sit near the center of the space and come out
//   close to every query, so they don't count as semantic matches. Lexical search still finds
//   them. The picture vector of an image is kept whatever its caption length.
// - Of the rest, only hits that stand out from this query's own distances are kept: closer than
//   the median by MATCH_MADS robust deviations. A median and MAD aren't dragged along when many
//   chunks really match, unlike a mean and standard deviation.
const MIN_MEANINGFUL_LENGTH = 12;
const MATCH_MADS = 3;
const MIN_SEMANTIC_POOL = 10;
// The best keyword hit counts as much as a semantic hit right at the cutoff. Any semantic match
// then ranks above keyword-only hits, and a chunk found both ways adds the two. BM25 scores of a
// short query are often close together, so a higher weight let every keyword hit outrank all
// but the most striking semantic matches.
const LEXICAL_MATCH_WEIGHT = MATCH_MADS;
const SEMANTIC_POOL = 300;

const meaningfulLength = (text: string): number => {
  let length = 0;
  for (const char of text.replace(/[\s\p{P}\p{S}]+/gu, "")) {
    // A Han character carries about as much as a short word.
    length += /\p{Script=Han}/u.test(char) ? 3 : 1;
  }
  return length;
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const filterSemanticHits = (hits: readonly VectorDbSearchHit[]): VectorDbSearchHit[] => {
  const candidates = hits.filter(
    (hit) =>
      hit.vectorDistance !== undefined &&
      (hit.chunkId.endsWith(":image") || meaningfulLength(hit.content) >= MIN_MEANINGFUL_LENGTH),
  );
  // ponytail: too few candidates to tell a match from the background; lexical hits still show.
  if (candidates.length < MIN_SEMANTIC_POOL) return [];
  const distances = candidates.map((hit) => hit.vectorDistance ?? Infinity);
  const center = median(distances);
  const spread = median(distances.map((distance) => Math.abs(distance - center))) * 1.4826;
  const cutoff = center - MATCH_MADS * spread;
  // Score each match by how far it stands out, in robust deviations, so fusion can tell a
  // striking match from one that barely passed.
  return candidates
    .filter((hit) => (hit.vectorDistance ?? Infinity) <= cutoff)
    .map((hit) => ({
      ...hit,
      score: (center - (hit.vectorDistance ?? center)) / Math.max(spread, 1e-6),
    }));
};

// Adds the two signals by size, not by rank: a picture that matches far better than anything
// else shouldn't lose to a chunk that matches both lists weakly.
const fuseByScore = (
  lexical: readonly VectorDbSearchHit[],
  semantic: readonly VectorDbSearchHit[],
): Map<string, VectorDbSearchHit> => {
  const bestBm25 = Math.max(0, ...lexical.map((hit) => hit.bm25Score ?? 0));
  const merged = new Map<string, VectorDbSearchHit>();
  for (const hit of lexical) {
    const strength =
      bestBm25 > 0 ? (hit.bm25Score ?? 0) / bestBm25 : 1 / ((hit.lexicalRank ?? 1) + 1);
    merged.set(hit.chunkId, { ...hit, score: LEXICAL_MATCH_WEIGHT * strength });
  }
  for (const hit of semantic) {
    const previous = merged.get(hit.chunkId);
    merged.set(hit.chunkId, { ...(previous ?? hit), score: (previous?.score ?? 0) + hit.score });
  }
  return merged;
};

// Reciprocal rank fusion: only the order within each list counts.
const fuseByRank = (
  lexical: readonly VectorDbSearchHit[],
  semantic: readonly VectorDbSearchHit[],
): Map<string, VectorDbSearchHit> => {
  const merged = new Map<string, VectorDbSearchHit>();
  for (const list of [lexical, semantic]) {
    list.forEach((hit, rank) => {
      const previous = merged.get(hit.chunkId);
      merged.set(hit.chunkId, { ...hit, score: (previous?.score ?? 0) + 1 / (60 + rank + 1) });
    });
  }
  return merged;
};

export const searchContent = async (input: {
  query: string;
  vectorDb: VectorDbClient;
  files: readonly LiveStoreFile[];
  topK?: number;
  fileIds?: readonly string[];
  signal?: AbortSignal;
  semantic?: EmbeddingRuntime | null;
  semanticMode?: SemanticSearchMode;
  /**
   * Show only semantic hits that stand out and fuse by score size, for people scanning a short
   * list. The assistant's search tool leaves this off: it reads and judges results itself, so it
   * keeps every candidate and the rank-based fusion it was evaluated with.
   */
  standoutOnly?: boolean;
}): Promise<ContentSearchResult[]> => {
  const standoutOnly = input.standoutOnly ?? false;
  const query = input.query.trim();
  if (!query) return [];
  input.signal?.throwIfAborted();
  // Always retain the complete lexical index while the semantic index is being built.
  const activeFiles = input.files.filter(
    (file) =>
      !file.deletedAt && !file.purgedAt && (!input.fileIds || input.fileIds.includes(file.id)),
  );
  if (!activeFiles.length) return [];
  const scope = { kind: "documents" as const, documentIds: activeFiles.map((file) => file.id) };
  const topK = Math.max(1, input.topK ?? 8);
  const lexical =
    input.semanticMode === "bge"
      ? []
      : await input.vectorDb.forIndex(LEXICAL_INDEX_CONFIG).search({
          query,
          scope,
          topK: 40,
          lexicalCandidateK: 40,
          semanticCandidateK: 0,
          semanticWeight: 0,
        });
  input.signal?.throwIfAborted();
  const semantic: VectorDbSearchHit[] = [];
  const semanticPool = standoutOnly ? SEMANTIC_POOL : 40;
  if (input.semantic) {
    const embeddings = await input.semantic.embed([query], "query", { signal: input.signal });
    input.signal?.throwIfAborted();
    validateEmbeddings(embeddings, 1, input.semantic.indexConfig.dimensions);
    const nearest = await input.vectorDb.forIndex(input.semantic.indexConfig).search({
      query,
      scope,
      // A wide pool keeps unrelated chunks the majority, so the median stays a fair baseline
      // even when a topic fills many chunks. In a small library it's every chunk.
      topK: semanticPool,
      lexicalCandidateK: 0,
      semanticCandidateK: semanticPool,
      lexicalWeight: 0,
      semanticWeight: 1,
      queryEmbedding: embeddings[0],
    });
    semantic.push(...(standoutOnly ? filterSemanticHits(nearest) : nearest));
  }
  input.signal?.throwIfAborted();
  const merged = standoutOnly ? fuseByScore(lexical, semantic) : fuseByRank(lexical, semantic);
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
      ...(file.type === "image" ? { imagePath: file.thumbnailPath ?? file.storagePath } : {}),
    });
  }
  return results;
};
