export const WHISPER_SAMPLE_RATE = 16_000;
export const WHISPER_MAX_SECONDS = 5;
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

export const isUsableText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes("[BLANK_AUDIO]")) return false;
  if (trimmed.length <= 1) return false;
  if (/^(.)\1+$/.test(trimmed)) return false;
  return true;
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
