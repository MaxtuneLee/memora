import type { RecordingWord } from "@/types/library";

import {
  BLANK_AUDIO_MARKER_PATTERN,
  TRAILING_REPEAT_MAX_PHRASE_WORDS,
  TRAILING_REPEAT_MIN_COVERAGE,
  TRAILING_REPEAT_MIN_CYCLES,
  TRAILING_REPEAT_MIN_WORDS,
  TRAILING_REPEAT_WINDOW_WORDS,
  TRANSCRIPT_WORD_PATTERN,
} from "./constants";

interface TranscriptToken {
  normalized: string;
  start: number;
}

interface TailRepeatPattern {
  cycles: number;
  phraseLength: number;
  repeatedWords: number;
  startIndex: number;
}

const normalizeTranscriptWord = (value: string) => {
  return value.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
};

const normalizeTranscriptSpacing = (value: string) => {
  return value.replace(/\s+/g, " ").trim();
};

const tokenizeTranscript = (text: string): TranscriptToken[] => {
  return Array.from(text.matchAll(TRANSCRIPT_WORD_PATTERN), (match) => ({
    normalized: normalizeTranscriptWord(match[0]),
    start: match.index ?? 0,
  })).filter((token) => token.normalized.length > 0);
};

const normalizeChunkTokens = (chunks: RecordingWord[]) => {
  return chunks
    .map((chunk) => normalizeTranscriptWord(chunk.text))
    .filter((token) => token.length > 0);
};

const arraysEqual = (left: string[], right: string[]) => {
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

export const countBlankAudioMarkers = (text: string) => {
  return (text.match(BLANK_AUDIO_MARKER_PATTERN) ?? []).length;
};

export const stripBlankAudioMarkers = (text: string) => {
  return normalizeTranscriptSpacing(text.replace(BLANK_AUDIO_MARKER_PATTERN, " "));
};

export const findRepeatedTailPattern = (normalizedWords: string[]): TailRepeatPattern | null => {
  if (normalizedWords.length < TRAILING_REPEAT_MIN_WORDS) {
    return null;
  }

  const tailWindowStart = Math.max(0, normalizedWords.length - TRAILING_REPEAT_WINDOW_WORDS);
  const trailingWords = normalizedWords.slice(tailWindowStart);
  let bestPattern: TailRepeatPattern | null = null;
  const maxPhraseLength = Math.min(
    TRAILING_REPEAT_MAX_PHRASE_WORDS,
    Math.floor(trailingWords.length / TRAILING_REPEAT_MIN_CYCLES),
  );

  for (let phraseLength = 1; phraseLength <= maxPhraseLength; phraseLength += 1) {
    const anchor = trailingWords.slice(-phraseLength);
    if (anchor.length !== phraseLength) {
      continue;
    }

    let cycles = 1;
    for (
      let cursor = trailingWords.length - phraseLength * 2;
      cursor >= 0;
      cursor -= phraseLength
    ) {
      const candidate = trailingWords.slice(cursor, cursor + phraseLength);
      if (!arraysEqual(candidate, anchor)) {
        break;
      }
      cycles += 1;
    }

    const repeatedWords = cycles * phraseLength;
    const coverage = repeatedWords / trailingWords.length;
    if (
      cycles < TRAILING_REPEAT_MIN_CYCLES ||
      repeatedWords < TRAILING_REPEAT_MIN_WORDS ||
      coverage < TRAILING_REPEAT_MIN_COVERAGE
    ) {
      continue;
    }

    const pattern = {
      cycles,
      phraseLength,
      repeatedWords,
      startIndex: tailWindowStart + trailingWords.length - repeatedWords,
    } satisfies TailRepeatPattern;

    if (
      !bestPattern ||
      pattern.repeatedWords > bestPattern.repeatedWords ||
      (pattern.repeatedWords === bestPattern.repeatedWords &&
        pattern.startIndex < bestPattern.startIndex)
    ) {
      bestPattern = pattern;
    }
  }

  return bestPattern;
};

export const trimRepeatedTailWords = (text: string) => {
  const strippedText = stripBlankAudioMarkers(text);
  if (!strippedText) {
    return strippedText;
  }

  const tokens = tokenizeTranscript(strippedText);
  const pattern = findRepeatedTailPattern(tokens.map((token) => token.normalized));
  if (!pattern) {
    return strippedText;
  }

  const cutoff = tokens[pattern.startIndex]?.start ?? strippedText.length;
  return strippedText.slice(0, cutoff).trim();
};

export const trimRepeatedTailChunks = (chunks: RecordingWord[]) => {
  if (chunks.length < TRAILING_REPEAT_MIN_WORDS) {
    return chunks;
  }

  const pattern = findRepeatedTailPattern(normalizeChunkTokens(chunks));
  if (!pattern) {
    return chunks;
  }

  return chunks.slice(0, pattern.startIndex);
};

export const buildTextFromChunks = (chunks: RecordingWord[]) => {
  return normalizeTranscriptSpacing(chunks.map((chunk) => chunk.text).join(""));
};

/**
 * Splits a growing streaming hypothesis at its last word boundary. RNN-T-style
 * streaming decoders never revise words they've already emitted, so everything
 * before the trailing (still-forming) word is safe to commit permanently instead
 * of waiting for the model's final pass.
 */
export const splitConfirmedStreamingText = (
  text: string,
): { confirmed: string; pending: string } => {
  const lastSpace = text.lastIndexOf(" ");
  if (lastSpace === -1) {
    return { confirmed: "", pending: text };
  }
  return { confirmed: text.slice(0, lastSpace), pending: text.slice(lastSpace + 1) };
};

export const normalizeTextForTranscriptChecks = (text: string) => {
  return normalizeTranscriptSpacing(text);
};

export const tokenizeTranscriptText = tokenizeTranscript;
