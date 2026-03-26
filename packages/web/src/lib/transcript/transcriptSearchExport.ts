import type { RecordingWord } from "@/types/library";

export interface TranscriptSearchMatch {
  id: string;
  startSec: number | null;
  endSec: number | null;
  snippet: string;
  startChar: number;
  endChar: number;
}

export interface TranscriptCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  wordStartIndex: number;
  wordEndIndex: number;
}

interface SearchInput {
  query: string;
  text?: string;
  words?: RecordingWord[];
  maxResults?: number;
}

const GAP_THRESHOLD_SECONDS = 1.2;
const MAX_CHARS_PER_CUE = 42;
const MAX_SECONDS_PER_CUE = 4;
const SNIPPET_PADDING = 40;

const LEADING_NO_SPACE_RE = /^[,.;:!?，。！？；：)\]}]/u;
const TRAILING_NO_SPACE_RE = /[\s([{（【]$/u;
const PUNCTUATION_END_RE = /[.,!?;:，。！？；：]$/u;

interface WordRange {
  start: number;
  end: number;
  wordIndex: number;
}

const shouldInsertSpace = (current: string, nextToken: string): boolean => {
  if (current.length === 0) return false;
  if (TRAILING_NO_SPACE_RE.test(current)) return false;
  if (LEADING_NO_SPACE_RE.test(nextToken)) return false;
  if (/^\s/.test(nextToken)) return false;
  return true;
};

const appendToken = (current: string, nextToken: string): string => {
  if (shouldInsertSpace(current, nextToken)) {
    return `${current} ${nextToken}`;
  }
  return `${current}${nextToken}`;
};

const buildTextWithRanges = (words: RecordingWord[]): { text: string; ranges: WordRange[] } => {
  let text = "";
  const ranges: WordRange[] = [];

  words.forEach((word, wordIndex) => {
    const nextText = appendToken(text, word.text);
    const start = nextText.length - word.text.length;
    const end = nextText.length;
    ranges.push({ start, end, wordIndex });
    text = nextText;
  });

  return { text, ranges };
};

const buildSnippet = (text: string, startChar: number, endChar: number): string => {
  const start = Math.max(0, startChar - SNIPPET_PADDING);
  const end = Math.min(text.length, endChar + SNIPPET_PADDING);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
};

const findWordRangeForMatch = (
  ranges: WordRange[],
  startChar: number,
  endChar: number,
): { firstWordIndex: number; lastWordIndex: number } | null => {
  let firstWordIndex: number | null = null;
  let lastWordIndex: number | null = null;

  for (const range of ranges) {
    if (range.end > startChar && firstWordIndex === null) {
      firstWordIndex = range.wordIndex;
    }
    if (range.start < endChar) {
      lastWordIndex = range.wordIndex;
    } else {
      break;
    }
  }

  if (firstWordIndex === null || lastWordIndex === null) {
    return null;
  }

  return { firstWordIndex, lastWordIndex };
};

export const searchTranscript = ({
  query,
  text,
  words = [],
  maxResults = 200,
}: SearchInput): TranscriptSearchMatch[] => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const hasWords = words.length > 0;
  const { text: wordsText, ranges } = hasWords
    ? buildTextWithRanges(words)
    : { text: "", ranges: [] as WordRange[] };

  const searchableText = hasWords ? wordsText : (text ?? "");
  if (!searchableText.trim()) return [];

  const haystack = searchableText.toLocaleLowerCase();
  const needle = normalizedQuery.toLocaleLowerCase();
  const matches: TranscriptSearchMatch[] = [];

  let fromIndex = 0;
  while (fromIndex < haystack.length && matches.length < maxResults) {
    const startChar = haystack.indexOf(needle, fromIndex);
    if (startChar === -1) break;

    const endChar = startChar + needle.length;
    let startSec: number | null = null;
    let endSec: number | null = null;

    if (hasWords) {
      const wordRange = findWordRangeForMatch(ranges, startChar, endChar);
      if (wordRange) {
        startSec = words[wordRange.firstWordIndex]?.timestamp[0] ?? null;
        endSec = words[wordRange.lastWordIndex]?.timestamp[1] ?? null;
      }
    }

    matches.push({
      id: `${startChar}-${endChar}-${matches.length}`,
      startSec,
      endSec,
      snippet: buildSnippet(searchableText, startChar, endChar),
      startChar,
      endChar,
    });

    fromIndex = endChar;
  }

  return matches;
};

export const buildCaptionCues = (words: RecordingWord[]): TranscriptCue[] => {
  if (words.length === 0) return [];

  const cues: TranscriptCue[] = [];
  let chunkStart = 0;
  let chunkText = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    chunkText = appendToken(chunkText, word.text);

    const chunkStartSec = words[chunkStart]?.timestamp[0] ?? word.timestamp[0];
    const chunkEndSec = word.timestamp[1];
    const duration = Math.max(0, chunkEndSec - chunkStartSec);
    const cleanText = chunkText.trim();
    const nextWord = words[i + 1];
    const gapToNext = nextWord ? Math.max(0, nextWord.timestamp[0] - word.timestamp[1]) : 0;

    const hasTerminalPunctuation = PUNCTUATION_END_RE.test(word.text.trim());
    const exceededGap = gapToNext > GAP_THRESHOLD_SECONDS;
    const exceededChars = cleanText.length >= MAX_CHARS_PER_CUE;
    const exceededDuration = duration >= MAX_SECONDS_PER_CUE;
    const isLastWord = i === words.length - 1;

    if (hasTerminalPunctuation || exceededGap || exceededChars || exceededDuration || isLastWord) {
      if (cleanText) {
        cues.push({
          id: `cue-${chunkStart}-${i}`,
          startSec: chunkStartSec,
          endSec: Math.max(chunkEndSec, chunkStartSec + 0.1),
          text: cleanText,
          wordStartIndex: chunkStart,
          wordEndIndex: i,
        });
      }
      chunkStart = i + 1;
      chunkText = "";
    }
  }

  return cues;
};

const formatSrtTime = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const totalMs = Math.round(safeSeconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hour = Math.floor(totalMin / 60);

  const hh = String(hour).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  const mmm = String(ms).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
};

export const buildSrt = (words: RecordingWord[]): string => {
  const cues = buildCaptionCues(words);
  if (cues.length === 0) return "";

  return cues
    .map((cue, index) => {
      return `${index + 1}\n${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}\n${cue.text}\n`;
    })
    .join("\n");
};

export const downloadText = (
  content: string,
  fileName: string,
  mimeType = "text/plain;charset=utf-8",
): void => {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};
