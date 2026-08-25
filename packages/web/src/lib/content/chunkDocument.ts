import type { ContentArtifact, ContentLocator, ContentSegment } from "./types";
import { hashContent } from "./sourceRevision";

export const CHUNKER_VERSION = "segment-window-v1";
export const DEFAULT_CHUNK_SIZE = 420;
export const DEFAULT_CHUNK_OVERLAP = 60;

export interface ContentChunk {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  startOffset?: number;
  endOffset?: number;
  headingPath: string[];
  locator: ContentLocator;
}

const splitSegment = (segment: ContentSegment, size: number, overlap: number): string[] => {
  const text = segment.text.trim();
  if (!text) return [];
  const result: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + size);
    result.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return result.filter(Boolean);
};

export const chunkContentArtifact = async (
  artifact: ContentArtifact,
  options: { size?: number; overlap?: number } = {},
): Promise<ContentChunk[]> => {
  const size = Math.max(80, options.size ?? DEFAULT_CHUNK_SIZE);
  const overlap = Math.min(size - 1, Math.max(0, options.overlap ?? DEFAULT_CHUNK_OVERLAP));
  const chunks: ContentChunk[] = [];
  for (const segment of artifact.segments) {
    if (!segment.searchable) continue;
    const pieces = splitSegment(segment, size, overlap);
    for (const content of pieces) {
      const chunkIndex = chunks.length;
      const contentHash = await hashContent(content.replace(/\s+/g, " ").trim());
      chunks.push({
        chunkId: `${artifact.fileId}:${segment.id}:${chunkIndex}:${CHUNKER_VERSION}`,
        documentId: artifact.fileId,
        chunkIndex,
        content,
        contentHash,
        headingPath: segment.headingPath,
        locator: segment.locator,
      });
    }
  }
  return chunks;
};
