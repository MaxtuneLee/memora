import type {
  RecordingWord,
  TranscriptDiagnostics,
  TranscriptDiagnosticsIssueCode,
} from "@/types/library";

import {
  ACTIVE_FRAME_PEAK_THRESHOLD,
  ACTIVE_FRAME_RMS_THRESHOLD,
  AUDIO_ANALYSIS_WINDOW_SAMPLES,
  HIGH_REPETITION_RATIO_THRESHOLD,
  HIGH_WORDS_PER_SECOND_THRESHOLD,
  LOW_ACTIVE_FRAME_RATIO_THRESHOLD,
  LOW_AUDIO_PEAK_THRESHOLD,
  LOW_AUDIO_RMS_THRESHOLD,
  WHISPER_SAMPLE_RATE,
  type TranscriptCandidateEvaluation,
} from "./constants";
import {
  buildTextFromChunks,
  countBlankAudioMarkers,
  findRepeatedTailPattern,
  normalizeTextForTranscriptChecks,
  stripBlankAudioMarkers,
  tokenizeTranscriptText,
  trimRepeatedTailChunks,
  trimRepeatedTailWords,
} from "./text";

interface AudioSignalStats {
  durationSec: number;
  rms: number;
  peak: number;
  activeFrameRatio: number;
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

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

  for (
    let offset = 0;
    offset < audio.length;
    offset += AUDIO_ANALYSIS_WINDOW_SAMPLES
  ) {
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
  repeatedTailPattern: ReturnType<typeof findRepeatedTailPattern>;
  repetitionRatio: number;
  wordCount: number;
}): TranscriptDiagnosticsIssueCode | null => {
  if (!cleanedText) {
    if (repeatedTailPattern) {
      return "repeated-tail-loop";
    }
    if (blankAudioMarkerCount > 0) {
      return "blank-audio-marker";
    }
    return "empty-after-cleanup";
  }

  if (hasLowContent) {
    return "low-content";
  }

  if (
    repeatedTailPattern &&
    repeatedTailPattern.repeatedWords >= Math.max(12, Math.ceil(wordCount * 0.5))
  ) {
    return "repeated-tail-loop";
  }

  if (
    lowAudioEnergy &&
    (blankAudioMarkerCount > 0 ||
      repetitionRatio >= HIGH_REPETITION_RATIO_THRESHOLD)
  ) {
    return "low-audio-energy";
  }

  return null;
};

export const isUsableText = (text: string) => {
  const trimmedText = trimRepeatedTailWords(text);
  if (!trimmedText) {
    return false;
  }
  if (trimmedText.length <= 1) {
    return false;
  }
  return !/^(.)\1+$/.test(trimmedText);
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
  const rawTokens = tokenizeTranscriptText(strippedText);
  const repeatedTailPattern = findRepeatedTailPattern(
    rawTokens.map((token) => token.normalized),
  );

  const cleanedText = trimRepeatedTailWords(strippedText);
  const cleanedWords = trimRepeatedTailChunks(
    words.filter((word) => Array.isArray(word.timestamp)),
  );
  const fallbackText = buildTextFromChunks(cleanedWords);
  const resolvedText = normalizeTextForTranscriptChecks(cleanedText || fallbackText);
  const resolvedTokens = tokenizeTranscriptText(resolvedText);
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
  if (blankAudioMarkerCount > 0) {
    issues.push("blank-audio-marker");
  }
  if (!resolvedText) {
    issues.push("empty-after-cleanup");
  }
  if (hasLowContent) {
    issues.push("low-content");
  }
  if (lowAudioEnergy) {
    issues.push("low-audio-energy");
  }
  if (highRepetition) {
    issues.push("high-repetition");
  }
  if (repeatedTailPattern) {
    issues.push("repeated-tail-loop");
  }
  if (denseOutput) {
    issues.push("dense-output");
  }

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
  const uniqueIssues = Array.from(
    new Set(segments.flatMap((segment) => segment.issues)),
  );
  const tokens = tokenizeTranscriptText(text);
  const uniqueWordRatio =
    tokens.length > 0
      ? new Set(tokens.map((token) => token.normalized)).size / tokens.length
      : 0;
  const repetitionRatio =
    totalWordCount > 0 ? 1 - uniqueWordRatio : acceptedSegments.length > 0 ? 1 : 0;
  const averageMetric = <Key extends keyof TranscriptDiagnostics>(key: Key) => {
    return (
      segments.reduce((sum, segment) => sum + Number(segment[key] ?? 0), 0) /
      segments.length
    );
  };

  return {
    source: "heuristic-v1",
    audioDurationSec: totalAudioDurationSec,
    audioRms: averageMetric("audioRms"),
    audioPeak: Math.max(...segments.map((segment) => segment.audioPeak)),
    activeFrameRatio: averageMetric("activeFrameRatio"),
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
    qualityScore: averageMetric("qualityScore"),
    dropped: acceptedSegments.length === 0,
    dropReason:
      acceptedSegments.length === 0
        ? segments.find((segment) => segment.dropReason)?.dropReason ?? null
        : null,
    issues: uniqueIssues,
    segmentCount: segments.length,
    acceptedSegmentCount: acceptedSegments.length,
    rejectedSegmentCount: segments.length - acceptedSegments.length,
  };
};
