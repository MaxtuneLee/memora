import { getSearchTerms } from "./searchTerms";

export interface GroundedTranscriptWord {
  text: string;
  timestamp: [number, number];
}

export interface GroundedTranscriptSource {
  id: string;
  name: string;
  words: GroundedTranscriptWord[];
}

export interface GroundedChunk {
  id: string;
  sourceId: string;
  sourceName: string;
  text: string;
  timestamp: [number, number];
  score: number;
  vectorDistance?: number;
  cosineSimilarity?: number;
}

export interface ContextPack {
  chunks: GroundedChunk[];
  candidateCount: number;
  excludedByBudget: number;
  characterCount: number;
}

const normalize = (value: string): string => value.toLocaleLowerCase().replace(/\s+/g, "").trim();

const countOccurrences = (text: string, query: string): number => {
  if (!query) return 0;

  let count = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const index = text.indexOf(query, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + query.length;
  }
  return count;
};

const scoreText = (text: string, query: string): number => {
  const normalizedText = normalize(text);
  const normalizedQuery = normalize(query);
  if (!normalizedText || !normalizedQuery) return 0;

  const exactMatches = countOccurrences(normalizedText, normalizedQuery);
  const terms = getSearchTerms(query);
  const termScore = terms.reduce((total, term) => {
    return total + countOccurrences(normalizedText, normalize(term));
  }, 0);
  return exactMatches * 8 + termScore;
};

export const formatTimestamp = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

export const buildGroundedChunks = (
  sources: GroundedTranscriptSource[],
  query: string,
  targetCharacters: number,
): GroundedChunk[] => {
  const safeTarget = Number.isFinite(targetCharacters)
    ? Math.max(120, Math.floor(targetCharacters))
    : 420;
  const chunks: GroundedChunk[] = [];

  for (const source of sources) {
    let entries: GroundedTranscriptWord[] = [];
    let length = 0;

    const commit = () => {
      if (!entries.length) return;
      const text = entries
        .map((entry) => entry.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        chunks.push({
          id: `${source.id}:${chunks.length}`,
          sourceId: source.id,
          sourceName: source.name,
          text,
          timestamp: [
            entries[0].timestamp[0],
            entries.at(-1)?.timestamp[1] ?? entries[0].timestamp[1],
          ],
          score: scoreText(text, query),
        });
      }
      entries = [];
      length = 0;
    };

    for (const word of source.words) {
      const nextLength = length + word.text.length;
      if (entries.length > 0 && nextLength > safeTarget) {
        commit();
      }
      entries.push(word);
      length += word.text.length;
    }
    commit();
  }

  return chunks.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
};

const contextBlock = (chunk: GroundedChunk): string => {
  const range = `${formatTimestamp(chunk.timestamp[0])}–${formatTimestamp(chunk.timestamp[1])}`;
  return `[${chunk.sourceName} · ${range} · ${chunk.id}]\n${chunk.text}`;
};

export const buildContextPack = (
  chunks: GroundedChunk[],
  topK: number,
  characterBudget: number,
  includeZeroScore = false,
): ContextPack => {
  const safeTopK = Number.isFinite(topK) ? Math.max(1, Math.floor(topK)) : 4;
  const candidates = chunks
    .filter((chunk) => includeZeroScore || chunk.score > 0)
    .slice(0, safeTopK);
  const safeBudget = Number.isFinite(characterBudget)
    ? Math.max(200, Math.floor(characterBudget))
    : 3600;
  const selected: GroundedChunk[] = [];
  let characterCount = 0;
  let excludedByBudget = 0;

  for (const chunk of candidates) {
    const blockLength = contextBlock(chunk).length + (selected.length ? 2 : 0);
    if (characterCount + blockLength > safeBudget) {
      excludedByBudget += 1;
      continue;
    }
    selected.push(chunk);
    characterCount += blockLength;
  }

  return {
    chunks: selected,
    candidateCount: candidates.length,
    excludedByBudget,
    characterCount,
  };
};

export const formatContextForModel = (pack: ContextPack): string => {
  return pack.chunks.map(contextBlock).join("\n\n");
};
