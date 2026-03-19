import { useCallback, useRef } from "react";

import {
  WHISPER_MAX_SAMPLES,
  WHISPER_SAMPLE_RATE,
} from "@/lib/transcript/transcriptUtils";

export const useSpeechBuffer = ({
  enqueueSpeech,
}: {
  enqueueSpeech: (audio: Float32Array, startSec: number) => void;
}) => {
  const collectingRef = useRef(false);
  const speechBufferRef = useRef<Float32Array[]>([]);
  const speechBufferSizeRef = useRef(0);
  const speechStartTimeRef = useRef<number | null>(null);
  const speechStartSecRef = useRef<number | null>(null);
  const speechBufferOffsetSecRef = useRef(0);

  const consumeSpeechBuffer = useCallback((count: number) => {
    const output = new Float32Array(count);
    let offset = 0;

    while (offset < count && speechBufferRef.current.length > 0) {
      const chunk = speechBufferRef.current[0];
      const remaining = count - offset;

      if (chunk.length <= remaining) {
        output.set(chunk, offset);
        offset += chunk.length;
        speechBufferRef.current.shift();
      } else {
        output.set(chunk.subarray(0, remaining), offset);
        speechBufferRef.current[0] = chunk.subarray(remaining);
        offset += remaining;
      }
    }

    return output;
  }, []);

  const appendSpeechFrame = useCallback(
    (frame: Float32Array) => {
      speechBufferRef.current.push(frame);
      speechBufferSizeRef.current += frame.length;

      while (speechBufferSizeRef.current >= WHISPER_MAX_SAMPLES) {
        const chunk = consumeSpeechBuffer(WHISPER_MAX_SAMPLES);
        speechBufferSizeRef.current -= WHISPER_MAX_SAMPLES;
        if (speechStartSecRef.current != null) {
          const chunkStartSec =
            speechStartSecRef.current + speechBufferOffsetSecRef.current;
          enqueueSpeech(chunk, chunkStartSec);
          speechBufferOffsetSecRef.current += chunk.length / WHISPER_SAMPLE_RATE;
        }
      }
    },
    [consumeSpeechBuffer, enqueueSpeech],
  );

  const flushSpeechBuffer = useCallback(() => {
    if (speechBufferSizeRef.current === 0) {
      return;
    }

    const chunk = consumeSpeechBuffer(speechBufferSizeRef.current);
    speechBufferSizeRef.current = 0;
    if (speechStartSecRef.current != null) {
      const chunkStartSec =
        speechStartSecRef.current + speechBufferOffsetSecRef.current;
      enqueueSpeech(chunk, chunkStartSec);
      speechBufferOffsetSecRef.current += chunk.length / WHISPER_SAMPLE_RATE;
    }
  }, [consumeSpeechBuffer, enqueueSpeech]);

  const resetSpeechCollection = useCallback(() => {
    collectingRef.current = false;
    speechBufferRef.current = [];
    speechBufferSizeRef.current = 0;
    speechBufferOffsetSecRef.current = 0;
    speechStartTimeRef.current = null;
    speechStartSecRef.current = null;
  }, []);

  return {
    collectingRef,
    speechBufferSizeRef,
    speechStartTimeRef,
    speechStartSecRef,
    appendSpeechFrame,
    flushSpeechBuffer,
    resetSpeechCollection,
  };
};
