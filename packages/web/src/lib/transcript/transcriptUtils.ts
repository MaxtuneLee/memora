import type {
  RecordingWord,
  TranscriptDiagnostics,
  TranscriptDiagnosticsIssueCode,
} from "@/types/library";

export const WHISPER_SAMPLE_RATE = 16_000;
export const WHISPER_MAX_SECONDS = 30;
export const WHISPER_MAX_SAMPLES = WHISPER_SAMPLE_RATE * WHISPER_MAX_SECONDS;

export const WORD_PLAYBACK_SPEED = 0.6;
export const MIN_WORD_DELAY_MS = 40;
export const MAX_WORD_DELAY_MS = 400;

export const TRANSFORMERS_CACHE_DIR = "/transformers-cache";
export const TRANSCRIPT_LANGUAGE_STORAGE_KEY = "transcriptLanguage";

export interface WordAnimationChunk {
  text: string;
  timestamp?: [number, number];
}

export interface WordAnimationWord {
  text: string;
  delayMs: number;
}

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

interface AudioSignalStats {
  durationSec: number;
  rms: number;
  peak: number;
  activeFrameRatio: number;
}

export interface TranscriptCandidateEvaluation {
  text: string;
  words: RecordingWord[];
  diagnostics: TranscriptDiagnostics;
  shouldKeep: boolean;
}

const BLANK_AUDIO_MARKER_PATTERN = /\[BLANK_AUDIO\]/giu;
const TRANSCRIPT_WORD_PATTERN =
  /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

const TRAILING_REPEAT_WINDOW_WORDS = 48;
const TRAILING_REPEAT_MIN_WORDS = 6;
const TRAILING_REPEAT_MIN_CYCLES = 3;
const TRAILING_REPEAT_MIN_COVERAGE = 0.35;
const TRAILING_REPEAT_MAX_PHRASE_WORDS = 8;

const AUDIO_ANALYSIS_WINDOW_SAMPLES = 320;
const ACTIVE_FRAME_RMS_THRESHOLD = 0.01;
const ACTIVE_FRAME_PEAK_THRESHOLD = 0.045;
const LOW_AUDIO_RMS_THRESHOLD = 0.003;
const LOW_AUDIO_PEAK_THRESHOLD = 0.035;
const LOW_ACTIVE_FRAME_RATIO_THRESHOLD = 0.08;

const HIGH_REPETITION_RATIO_THRESHOLD = 0.58;
const HIGH_WORDS_PER_SECOND_THRESHOLD = 5.5;

const normalizeTranscriptWord = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeTranscriptSpacing = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const countBlankAudioMarkers = (text: string) =>
  (text.match(BLANK_AUDIO_MARKER_PATTERN) ?? []).length;

export const stripBlankAudioMarkers = (text: string) =>
  normalizeTranscriptSpacing(text.replace(BLANK_AUDIO_MARKER_PATTERN, " "));

const tokenizeTranscript = (text: string): TranscriptToken[] =>
  Array.from(text.matchAll(TRANSCRIPT_WORD_PATTERN), (match) => ({
    normalized: normalizeTranscriptWord(match[0]),
    start: match.index ?? 0,
  })).filter((token) => token.normalized.length > 0);

const normalizeChunkTokens = (chunks: RecordingWord[]) =>
  chunks
    .map((chunk) => normalizeTranscriptWord(chunk.text))
    .filter((token) => token.length > 0);

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const findRepeatedTailPattern = (normalizedWords: string[]) => {
  if (normalizedWords.length < TRAILING_REPEAT_MIN_WORDS) {
    return null;
  }

  const tailWindowStart = Math.max(
    0,
    normalizedWords.length - TRAILING_REPEAT_WINDOW_WORDS,
  );
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
  const stripped = stripBlankAudioMarkers(text);
  if (!stripped) return stripped;

  const tokens = tokenizeTranscript(stripped);
  const pattern = findRepeatedTailPattern(
    tokens.map((token) => token.normalized),
  );
  if (!pattern) {
    return stripped;
  }

  const cutoff = tokens[pattern.startIndex]?.start ?? stripped.length;
  return stripped.slice(0, cutoff).trim();
};

const trimRepeatedTailChunks = (chunks: RecordingWord[]) => {
  if (chunks.length < TRAILING_REPEAT_MIN_WORDS) {
    return chunks;
  }

  const pattern = findRepeatedTailPattern(normalizeChunkTokens(chunks));
  if (!pattern) {
    return chunks;
  }

  return chunks.slice(0, pattern.startIndex);
};

const buildTextFromChunks = (chunks: RecordingWord[]) =>
  normalizeTranscriptSpacing(chunks.map((chunk) => chunk.text).join(""));

const analyzeAudioSignal = (audio: Float32Array): AudioSignalStats => {
  if (audio.length === 0) {
    return {
      durationSec: 0,
      rms: 0,
      peak: 0,
      activeFrameRatio: 0,
    };
  }

  let sumSquares = 0;
  let peak = 0;
  let activeFrames = 0;
  let totalFrames = 0;

  for (let offset = 0; offset < audio.length; offset += AUDIO_ANALYSIS_WINDOW_SAMPLES) {
    let frameSumSquares = 0;
    let framePeak = 0;
    const end = Math.min(audio.length, offset + AUDIO_ANALYSIS_WINDOW_SAMPLES);

    for (let index = offset; index < end; index += 1) {
      const sample = audio[index] ?? 0;
      const magnitude = Math.abs(sample);
      sumSquares += sample * sample;
      frameSumSquares += sample * sample;
      peak = Math.max(peak, magnitude);
      framePeak = Math.max(framePeak, magnitude);
    }

    const frameLength = end - offset;
    const frameRms =
      frameLength > 0 ? Math.sqrt(frameSumSquares / frameLength) : 0;
    if (
      frameRms >= ACTIVE_FRAME_RMS_THRESHOLD ||
      framePeak >= ACTIVE_FRAME_PEAK_THRESHOLD
    ) {
      activeFrames += 1;
    }
    totalFrames += 1;
  }

  return {
    durationSec: audio.length / WHISPER_SAMPLE_RATE,
    rms: Math.sqrt(sumSquares / audio.length),
    peak,
    activeFrameRatio: totalFrames > 0 ? activeFrames / totalFrames : 0,
  };
};

const getMostSevereDropReason = ({
  blankAudioMarkerCount,
  cleanedText,
  hasLowContent,
  lowAudioEnergy,
  repeatedTailPattern,
  repetitionRatio,
  wordCount,
}: {
  blankAudioMarkerCount: number;
  cleanedText: string;
  hasLowContent: boolean;
  lowAudioEnergy: boolean;
  repeatedTailPattern: TailRepeatPattern | null;
  repetitionRatio: number;
  wordCount: number;
}): TranscriptDiagnosticsIssueCode | null => {
  if (!cleanedText) {
    if (repeatedTailPattern) return "repeated-tail-loop";
    if (blankAudioMarkerCount > 0) return "blank-audio-marker";
    return "empty-after-cleanup";
  }

  if (hasLowContent) {
    return "low-content";
  }

  if (
    repeatedTailPattern &&
    repeatedTailPattern.repeatedWords >=
      Math.max(TRAILING_REPEAT_MIN_WORDS * 2, Math.ceil(wordCount * 0.5))
  ) {
    return "repeated-tail-loop";
  }

  if (
    lowAudioEnergy &&
    (blankAudioMarkerCount > 0 || repetitionRatio >= HIGH_REPETITION_RATIO_THRESHOLD)
  ) {
    return "low-audio-energy";
  }

  return null;
};

export const isUsableText = (text: string) => {
  const trimmed = trimRepeatedTailWords(text);
  if (!trimmed) return false;
  if (trimmed.length <= 1) return false;
  if (/^(.)\1+$/.test(trimmed)) return false;
  return true;
};

export const evaluateTranscriptCandidate = ({
  audio,
  text,
  words = [],
}: {
  audio: Float32Array;
  text: string;
  words?: RecordingWord[];
}): TranscriptCandidateEvaluation => {
  const blankAudioMarkerCount = countBlankAudioMarkers(text);
  const strippedText = stripBlankAudioMarkers(text);
  const rawTokens = tokenizeTranscript(strippedText);
  const rawNormalizedWords = rawTokens.map((token) => token.normalized);
  const repeatedTailPattern = findRepeatedTailPattern(rawNormalizedWords);

  const cleanedText = trimRepeatedTailWords(strippedText);
  const cleanedWords = trimRepeatedTailChunks(
    words.filter((word) => Array.isArray(word.timestamp)),
  );
  const fallbackText = buildTextFromChunks(cleanedWords);
  const resolvedText = normalizeTranscriptSpacing(cleanedText || fallbackText);
  const resolvedTokens = tokenizeTranscript(resolvedText);
  const wordCount = resolvedTokens.length;
  const uniqueWordRatio =
    wordCount > 0
      ? new Set(resolvedTokens.map((token) => token.normalized)).size / wordCount
      : 0;
  const repetitionRatio =
    wordCount > 0 ? 1 - uniqueWordRatio : rawTokens.length > 0 ? 1 : 0;

  const audioStats = analyzeAudioSignal(audio);
  const wordsPerSecond =
    audioStats.durationSec > 0 ? wordCount / audioStats.durationSec : 0;

  const hasLowContent =
    resolvedText.length <= 1 || /^(.)\1+$/u.test(resolvedText.trim());
  const lowAudioEnergy =
    audioStats.rms < LOW_AUDIO_RMS_THRESHOLD &&
    audioStats.peak < LOW_AUDIO_PEAK_THRESHOLD &&
    audioStats.activeFrameRatio < LOW_ACTIVE_FRAME_RATIO_THRESHOLD;
  const highRepetition =
    wordCount >= 8 && repetitionRatio >= HIGH_REPETITION_RATIO_THRESHOLD;
  const denseOutput =
    audioStats.durationSec >= 1 &&
    wordsPerSecond >= HIGH_WORDS_PER_SECOND_THRESHOLD;

  const issues: TranscriptDiagnosticsIssueCode[] = [];
  if (blankAudioMarkerCount > 0) issues.push("blank-audio-marker");
  if (!resolvedText) issues.push("empty-after-cleanup");
  if (hasLowContent) issues.push("low-content");
  if (lowAudioEnergy) issues.push("low-audio-energy");
  if (highRepetition) issues.push("high-repetition");
  if (repeatedTailPattern) issues.push("repeated-tail-loop");
  if (denseOutput) issues.push("dense-output");

  let hallucinationScore = 0;
  if (blankAudioMarkerCount > 0) {
    hallucinationScore += 0.22;
  }
  if (lowAudioEnergy) {
    hallucinationScore += 0.16;
  }
  if (highRepetition) {
    hallucinationScore += clamp(
      0.16 + (repetitionRatio - HIGH_REPETITION_RATIO_THRESHOLD) * 0.45,
      0.16,
      0.3,
    );
  }
  if (repeatedTailPattern) {
    hallucinationScore += clamp(
      0.18 + repeatedTailPattern.repeatedWords / 48,
      0.18,
      0.38,
    );
  }
  if (denseOutput) {
    hallucinationScore += clamp(
      (wordsPerSecond - HIGH_WORDS_PER_SECOND_THRESHOLD) / 5,
      0.08,
      0.18,
    );
  }
  if (hasLowContent) {
    hallucinationScore += 0.22;
  }
  if (!resolvedText) {
    hallucinationScore = 1;
  }

  hallucinationScore = clamp(hallucinationScore, 0, 1);
  const dropReason = getMostSevereDropReason({
    blankAudioMarkerCount,
    cleanedText: resolvedText,
    hasLowContent,
    lowAudioEnergy,
    repeatedTailPattern,
    repetitionRatio,
    wordCount,
  });

  const diagnostics: TranscriptDiagnostics = {
    source: "heuristic-v1",
    audioDurationSec: audioStats.durationSec,
    audioRms: audioStats.rms,
    audioPeak: audioStats.peak,
    activeFrameRatio: audioStats.activeFrameRatio,
    textLength: resolvedText.length,
    wordCount,
    wordsPerSecond,
    uniqueWordRatio,
    repetitionRatio,
    trailingRepeatPhraseWords: repeatedTailPattern?.repeatedWords ?? 0,
    trailingRepeatPhraseCycles: repeatedTailPattern?.cycles ?? 0,
    blankAudioMarkerCount,
    hallucinationScore,
    qualityScore: clamp(1 - hallucinationScore, 0, 1),
    dropped: dropReason !== null,
    dropReason,
    issues: Array.from(new Set(issues)),
  };

  if (dropReason) {
    return {
      text: "",
      words: [],
      diagnostics,
      shouldKeep: false,
    };
  }

  return {
    text: resolvedText,
    words: cleanedWords,
    diagnostics,
    shouldKeep: true,
  };
};

export const summarizeTranscriptDiagnostics = ({
  text,
  segments,
}: {
  text: string;
  segments: TranscriptDiagnostics[];
}): TranscriptDiagnostics | undefined => {
  if (segments.length === 0) {
    return undefined;
  }

  const totalAudioDurationSec = segments.reduce(
    (sum, segment) => sum + segment.audioDurationSec,
    0,
  );
  const totalWordCount = segments.reduce(
    (sum, segment) => sum + segment.wordCount,
    0,
  );
  const acceptedSegments = segments.filter((segment) => !segment.dropped);
  const rejectedSegments = segments.length - acceptedSegments.length;
  const uniqueIssues = Array.from(
    new Set(segments.flatMap((segment) => segment.issues)),
  );
  const uniqueWordRatio = (() => {
    const tokens = tokenizeTranscript(text);
    if (tokens.length === 0) return 0;
    return (
      new Set(tokens.map((token) => token.normalized)).size / tokens.length
    );
  })();
  const repetitionRatio =
    totalWordCount > 0 ? 1 - uniqueWordRatio : acceptedSegments.length > 0 ? 1 : 0;
  const averaged = <Key extends keyof TranscriptDiagnostics>(key: Key) =>
    segments.reduce((sum, segment) => sum + Number(segment[key] ?? 0), 0) /
    segments.length;

  return {
    source: "heuristic-v1",
    audioDurationSec: totalAudioDurationSec,
    audioRms: averaged("audioRms"),
    audioPeak: Math.max(...segments.map((segment) => segment.audioPeak)),
    activeFrameRatio: averaged("activeFrameRatio"),
    textLength: text.length,
    wordCount: totalWordCount,
    wordsPerSecond:
      totalAudioDurationSec > 0 ? totalWordCount / totalAudioDurationSec : 0,
    uniqueWordRatio,
    repetitionRatio,
    trailingRepeatPhraseWords: Math.max(
      ...segments.map((segment) => segment.trailingRepeatPhraseWords),
    ),
    trailingRepeatPhraseCycles: Math.max(
      ...segments.map((segment) => segment.trailingRepeatPhraseCycles),
    ),
    blankAudioMarkerCount: segments.reduce(
      (sum, segment) => sum + segment.blankAudioMarkerCount,
      0,
    ),
    hallucinationScore: Math.max(
      ...segments.map((segment) => segment.hallucinationScore),
    ),
    qualityScore: averaged("qualityScore"),
    dropped: acceptedSegments.length === 0,
    dropReason:
      acceptedSegments.length === 0
        ? segments.find((segment) => segment.dropReason)?.dropReason ?? null
        : null,
    issues: uniqueIssues,
    segmentCount: segments.length,
    acceptedSegmentCount: acceptedSegments.length,
    rejectedSegmentCount: rejectedSegments,
  };
};

export const buildWordAnimationWords = (
  chunks: WordAnimationChunk[],
  speed = WORD_PLAYBACK_SPEED,
  minDelay = MIN_WORD_DELAY_MS,
  maxDelay = MAX_WORD_DELAY_MS
): WordAnimationWord[] => {
  return chunks
    .filter((chunk) => chunk.text)
    .map((chunk, index, all) => {
      const prev = all[index - 1]?.timestamp?.[0] ?? 0;
      const start = chunk.timestamp?.[0] ?? prev + 0.2;
      const delta = Math.max(0.02, start - prev);
      const delayMs = Math.min(
        maxDelay,
        Math.max(minDelay, delta * 1000 * speed)
      );
      return { text: chunk.text, delayMs };
    });
};
