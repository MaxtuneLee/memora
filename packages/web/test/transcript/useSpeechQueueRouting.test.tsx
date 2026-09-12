// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vite-plus/test";

import { useSpeechQueue } from "@/hooks/transcript/useTranscript/useSpeechQueue";
import type { TranscriptionRuntime } from "@/lib/models/transcriptionRuntime";

const transcribe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/transcript/whisper/client", () => ({
  generateTranscription: transcribe,
}));

test("routes queued live speech through the selected transcription runtime", () => {
  const workerRef = { current: {} as Worker };
  const languageRef = { current: "auto" };
  const runtime = {
    modelId: "nemotron-3.5-asr-streaming-0.6b-int4",
    timestamps: "word",
    provider: {},
  } as TranscriptionRuntime;
  const runtimeRef = { current: runtime };
  const { result } = renderHook(() => useSpeechQueue({ workerRef, languageRef, runtimeRef }));

  act(() => result.current.enqueueSpeech(new Float32Array(1_600), 0));

  expect(transcribe).toHaveBeenCalledWith(
    workerRef.current,
    { audio: expect.any(Float32Array), language: "auto" },
    runtime,
  );
});
