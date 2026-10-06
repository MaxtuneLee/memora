import type { ContentArtifact, ContentLocator, ContentSegment } from "./types";
import { hashContent } from "./sourceRevision";

export const CHUNKER_VERSION = "segment-window-v2";
// Sizes are estimated tokens, not characters.
export const DEFAULT_CHUNK_SIZE = 256;
export const DEFAULT_CHUNK_OVERLAP = 40;

const MAX_OVERLAP_UNITS = 2;
const CHARS_PER_TOKEN_FOR_LONG_WORDS = 6;

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

const TOKEN_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
const CJK_PATTERN = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;

// ponytail: heuristic, no tokenizer in the platform. Swap this one function for a
// real WordPiece count if the estimate proves too loose.
export const estimateTokens = (text: string): number => {
  let total = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const piece = match[0];
    if (CJK_PATTERN.test(piece)) total += 1;
    else if (/^[\p{L}\p{N}_]/u.test(piece))
      total += Math.max(1.3, piece.length / CHARS_PER_TOKEN_FOR_LONG_WORDS);
    else total += 1;
  }
  return Math.ceil(total);
};

interface Unit {
  segmentIndex: number;
  text: string;
  tokens: number;
  // Position inside the segment's indexable text.
  start: number;
  end: number;
}

const segmentText = (segment: ContentSegment): string => (segment.markdown ?? segment.text).trim();

const splitLongSentence = (
  sentence: string,
  base: number,
  size: number,
  locale: string | undefined,
): Array<{ text: string; start: number; end: number }> => {
  const pieces: Array<{ text: string; start: number; end: number }> = [];
  const words = new Intl.Segmenter(locale, { granularity: "word" });
  const longWordChars = size * CHARS_PER_TOKEN_FOR_LONG_WORDS;
  let current = "";
  let currentStart = 0;
  const flush = (): void => {
    if (!current.trim()) return;
    pieces.push({
      text: current,
      start: base + currentStart,
      end: base + currentStart + current.length,
    });
  };
  for (const { segment, index } of words.segment(sentence)) {
    // Words are cut at word boundaries; an unbroken run longer than the window is
    // cut by characters.
    const parts =
      estimateTokens(segment) > size
        ? Array.from({ length: Math.ceil(segment.length / longWordChars) }, (_, i) =>
            segment.slice(i * longWordChars, (i + 1) * longWordChars),
          )
        : [segment];
    let partIndex = index;
    for (const part of parts) {
      if (current && estimateTokens(current + part) > size) {
        flush();
        current = "";
      }
      if (!current) currentStart = partIndex;
      current += part;
      partIndex += part.length;
    }
  }
  flush();
  return pieces;
};

const toUnits = (
  segment: ContentSegment,
  segmentIndex: number,
  size: number,
  locale: string | undefined,
): Unit[] => {
  const text = segmentText(segment);
  if (!text) return [];
  const units: Unit[] = [];
  const sentences = new Intl.Segmenter(locale, { granularity: "sentence" });
  for (const { segment: sentence, index } of sentences.segment(text)) {
    const tokens = estimateTokens(sentence);
    if (tokens <= size) {
      units.push({
        segmentIndex,
        text: sentence,
        tokens,
        start: index,
        end: index + sentence.trimEnd().length,
      });
      continue;
    }
    for (const piece of splitLongSentence(sentence, index, size, locale)) {
      units.push({ segmentIndex, tokens: estimateTokens(piece.text), ...piece });
    }
  }
  return units;
};

// Segments merge into one chunk only when they sit under the same heading and
// share a locator a single chunk can still point at. Null means never merge.
const mergeKey = (segment: ContentSegment): string | null => {
  const heading = JSON.stringify(segment.headingPath);
  switch (segment.locator.kind) {
    case "text":
    case "transcript":
      return `${segment.locator.kind}|${heading}`;
    case "page":
      return `page:${segment.locator.pageNumber}|${heading}`;
    case "slide":
      return `slide:${segment.locator.slideNumber}|${heading}`;
    case "image":
      return null;
  }
};

const joinUnits = (units: Unit[]): string => {
  let content = "";
  units.forEach((unit, index) => {
    if (index > 0) content += units[index - 1].segmentIndex === unit.segmentIndex ? "" : "\n\n";
    content += unit.text;
  });
  return content.trim();
};

const buildLocator = (first: ContentSegment, last: ContentSegment): { locator: ContentLocator } => {
  const a = first.locator;
  const b = last.locator;
  if (a.kind === "text" && b.kind === "text") {
    return {
      locator: { kind: "text", startOffset: a.startOffset, endOffset: b.endOffset },
    };
  }
  if (a.kind === "transcript" && b.kind === "transcript") {
    return {
      locator: { kind: "transcript", startSeconds: a.startSeconds, endSeconds: b.endSeconds },
    };
  }
  return { locator: a };
};

// Document offsets are only exact when the segment text is the located range itself.
const documentRange = (
  segment: ContentSegment,
  unit: Unit,
  edge: "start" | "end",
): number | undefined => {
  const locator = segment.locator;
  if (locator.kind !== "text") return undefined;
  const exact = locator.endOffset - locator.startOffset === segmentText(segment).length;
  if (exact) return locator.startOffset + (edge === "start" ? unit.start : unit.end);
  return edge === "start" ? locator.startOffset : locator.endOffset;
};

const packUnits = (units: Unit[], size: number, overlap: number): Unit[][] => {
  const chunks: Unit[][] = [];
  let current: Unit[] = [];
  let tokens = 0;
  for (const unit of units) {
    if (current.length > 0 && tokens + unit.tokens > size) {
      chunks.push(current);
      let carried: Unit[] = [];
      let carriedTokens = 0;
      for (const candidate of current.slice(-MAX_OVERLAP_UNITS).reverse()) {
        if (carriedTokens + candidate.tokens > overlap) break;
        carried = [candidate, ...carried];
        carriedTokens += candidate.tokens;
      }
      if (carriedTokens + unit.tokens > size) {
        carried = [];
        carriedTokens = 0;
      }
      current = carried;
      tokens = carriedTokens;
    }
    current.push(unit);
    tokens += unit.tokens;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};

export const chunkContentArtifact = async (
  artifact: ContentArtifact,
  options: { size?: number; overlap?: number; locale?: string } = {},
): Promise<ContentChunk[]> => {
  const size = Math.max(8, options.size ?? DEFAULT_CHUNK_SIZE);
  const overlap = Math.min(size - 1, Math.max(0, options.overlap ?? DEFAULT_CHUNK_OVERLAP));
  const segments = artifact.segments.filter((segment) => segment.searchable);

  const groups: Array<{ key: string | null; indices: number[] }> = [];
  segments.forEach((segment, index) => {
    const key = mergeKey(segment);
    const last = groups[groups.length - 1];
    if (key !== null && last?.key === key) last.indices.push(index);
    else groups.push({ key, indices: [index] });
  });

  const chunks: ContentChunk[] = [];
  for (const group of groups) {
    const units = group.indices.flatMap((index) =>
      toUnits(segments[index], index, size, options.locale),
    );
    for (const packed of packUnits(units, size, overlap)) {
      const content = joinUnits(packed);
      if (!content) continue;
      const first = packed[0];
      const last = packed[packed.length - 1];
      const firstSegment = segments[first.segmentIndex];
      const lastSegment = segments[last.segmentIndex];
      const chunkIndex = chunks.length;
      chunks.push({
        chunkId: `${artifact.fileId}:${firstSegment.id}:${chunkIndex}:${CHUNKER_VERSION}`,
        documentId: artifact.fileId,
        chunkIndex,
        content,
        contentHash: await hashContent(content.replace(/\s+/g, " ").trim()),
        startOffset: documentRange(firstSegment, first, "start"),
        endOffset: documentRange(lastSegment, last, "end"),
        headingPath: firstSegment.headingPath,
        ...buildLocator(firstSegment, lastSegment),
      });
    }
  }
  return chunks;
};
