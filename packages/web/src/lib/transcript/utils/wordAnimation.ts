import {
  MAX_WORD_DELAY_MS,
  MIN_WORD_DELAY_MS,
  WORD_PLAYBACK_SPEED,
  type WordAnimationChunk,
  type WordAnimationWord,
} from "./constants";

export const buildWordAnimationWords = (
  chunks: WordAnimationChunk[],
  speed = WORD_PLAYBACK_SPEED,
  minDelay = MIN_WORD_DELAY_MS,
  maxDelay = MAX_WORD_DELAY_MS,
): WordAnimationWord[] => {
  return chunks
    .filter((chunk) => chunk.text)
    .map((chunk, index, allChunks) => {
      const previousStart = allChunks[index - 1]?.timestamp?.[0] ?? 0;
      const start = chunk.timestamp?.[0] ?? previousStart + 0.2;
      const delta = Math.max(0.02, start - previousStart);
      const delayMs = Math.min(
        maxDelay,
        Math.max(minDelay, delta * 1000 * speed),
      );

      return {
        text: chunk.text,
        delayMs,
      };
    });
};
