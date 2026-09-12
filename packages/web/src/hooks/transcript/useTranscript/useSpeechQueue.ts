import type { MutableRefObject } from "react";
import { useCallback, useRef } from "react";

import { WHISPER_MAX_SAMPLES, WHISPER_SAMPLE_RATE } from "@/lib/transcript/transcriptUtils";
import type { TranscriptionRuntime } from "@/lib/models/transcriptionRuntime";
import { generateTranscription } from "@/lib/transcript/whisper/client";

export const useSpeechQueue = ({
  workerRef,
  languageRef,
  runtimeRef,
}: {
  workerRef: MutableRefObject<Worker | null>;
  languageRef: { current: string };
  runtimeRef: MutableRefObject<TranscriptionRuntime | null>;
}) => {
  const pendingSegmentsRef = useRef<Array<{ audio: Float32Array; startSec: number }>>([]);
  const currentSegmentRef = useRef<{
    audio: Float32Array;
    startSec: number;
  } | null>(null);
  const isProcessingRef = useRef(false);

  const tryProcessNext = useCallback(() => {
    if (isProcessingRef.current) {
      return;
    }

    const next = pendingSegmentsRef.current.shift();
    if (!next || !workerRef.current || !runtimeRef.current) {
      return;
    }

    isProcessingRef.current = true;
    currentSegmentRef.current = {
      audio: next.audio,
      startSec: next.startSec,
    };
    generateTranscription(
      workerRef.current,
      { audio: next.audio, language: languageRef.current },
      runtimeRef.current,
    );
  }, [languageRef, runtimeRef, workerRef]);

  const enqueueSpeech = useCallback(
    (audio: Float32Array, startSec: number) => {
      if (audio.length <= WHISPER_MAX_SAMPLES) {
        pendingSegmentsRef.current.push({ audio, startSec });
        tryProcessNext();
        return;
      }

      for (let offset = 0; offset < audio.length; offset += WHISPER_MAX_SAMPLES) {
        const chunk = audio.subarray(offset, offset + WHISPER_MAX_SAMPLES);
        pendingSegmentsRef.current.push({
          audio: chunk,
          startSec: startSec + offset / WHISPER_SAMPLE_RATE,
        });
      }
      tryProcessNext();
    },
    [tryProcessNext],
  );

  return {
    pendingSegmentsRef,
    currentSegmentRef,
    isProcessingRef,
    tryProcessNext,
    enqueueSpeech,
  };
};
