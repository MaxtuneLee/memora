import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import { buildWordAnimationWords } from "@/lib/transcript/transcriptUtils";

export const useWordAnimation = ({
  accumulatedTextRef,
  setAccumulatedText,
  setCurrentSegmentPrefix,
  setCurrentSegment,
}: {
  accumulatedTextRef: { current: string };
  setAccumulatedText: Dispatch<SetStateAction<string>>;
  setCurrentSegmentPrefix: Dispatch<SetStateAction<string>>;
  setCurrentSegment: Dispatch<SetStateAction<string>>;
}) => {
  const wordAnimationQueueRef = useRef<
    Array<{
      words: Array<{ text: string; delayMs: number }>;
      finalText: string;
    }>
  >([]);
  const wordAnimationRunningRef = useRef(false);
  const wordAnimationTimeoutRef = useRef<number | null>(null);

  const clearWordAnimations = useCallback(() => {
    if (wordAnimationTimeoutRef.current !== null) {
      window.clearTimeout(wordAnimationTimeoutRef.current);
      wordAnimationTimeoutRef.current = null;
    }
    wordAnimationQueueRef.current = [];
    wordAnimationRunningRef.current = false;
    setCurrentSegmentPrefix("");
    setCurrentSegment("");
  }, [setCurrentSegment, setCurrentSegmentPrefix]);

  const enqueueWordAnimation = useCallback(
    (chunks: Array<{ text: string; timestamp?: [number, number] }>, finalText: string) => {
      const words = buildWordAnimationWords(chunks);
      if (words.length === 0) {
        return;
      }

      wordAnimationQueueRef.current.push({ words, finalText });
      if (wordAnimationRunningRef.current) {
        return;
      }

      const runNext = () => {
        const job = wordAnimationQueueRef.current.shift();
        if (!job) {
          wordAnimationRunningRef.current = false;
          setCurrentSegmentPrefix("");
          return;
        }

        wordAnimationRunningRef.current = true;
        const baseText = accumulatedTextRef.current;
        setCurrentSegmentPrefix(baseText);
        setCurrentSegment("");

        let index = 0;
        const step = () => {
          if (index >= job.words.length) {
            wordAnimationRunningRef.current = false;
            setCurrentSegmentPrefix("");
            setCurrentSegment("");
            setAccumulatedText((previous) => {
              const nextText = previous
                ? `${previous} ${job.finalText.trim()}`
                : job.finalText.trim();
              accumulatedTextRef.current = nextText;
              return nextText;
            });
            runNext();
            return;
          }

          const word = job.words[index];
          setCurrentSegment((previous) => `${previous}${word.text}`);
          index += 1;
          wordAnimationTimeoutRef.current = window.setTimeout(step, word.delayMs);
        };

        step();
      };

      runNext();
    },
    [accumulatedTextRef, setAccumulatedText, setCurrentSegment, setCurrentSegmentPrefix],
  );

  return {
    clearWordAnimations,
    enqueueWordAnimation,
  };
};
