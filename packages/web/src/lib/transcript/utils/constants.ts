import type {
  RecordingWord,
  TranscriptDiagnostics,
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

export interface TranscriptCandidateEvaluation {
  text: string;
  words: RecordingWord[];
  diagnostics: TranscriptDiagnostics;
  shouldKeep: boolean;
}

export const BLANK_AUDIO_MARKER_PATTERN = /\[BLANK_AUDIO\]/giu;
export const TRANSCRIPT_WORD_PATTERN =
  /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export const TRAILING_REPEAT_WINDOW_WORDS = 48;
export const TRAILING_REPEAT_MIN_WORDS = 6;
export const TRAILING_REPEAT_MIN_CYCLES = 3;
export const TRAILING_REPEAT_MIN_COVERAGE = 0.35;
export const TRAILING_REPEAT_MAX_PHRASE_WORDS = 8;

export const AUDIO_ANALYSIS_WINDOW_SAMPLES = 320;
export const ACTIVE_FRAME_RMS_THRESHOLD = 0.01;
export const ACTIVE_FRAME_PEAK_THRESHOLD = 0.045;
export const LOW_AUDIO_RMS_THRESHOLD = 0.003;
export const LOW_AUDIO_PEAK_THRESHOLD = 0.035;
export const LOW_ACTIVE_FRAME_RATIO_THRESHOLD = 0.08;

export const HIGH_REPETITION_RATIO_THRESHOLD = 0.58;
export const HIGH_WORDS_PER_SECOND_THRESHOLD = 5.5;
