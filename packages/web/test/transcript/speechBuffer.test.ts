import { expect, test } from "vite-plus/test";

import { chooseCompletedSpeechAudio } from "@/hooks/transcript/useTranscript/useSpeechBuffer";

test("prefers the final VAD audio segment over frame-buffered audio", () => {
  const vadAudio = new Float32Array([0.1, 0.2, 0.3]);
  const bufferedAudio = new Float32Array([0.2, 0.3]);

  expect(
    chooseCompletedSpeechAudio({
      vadAudio,
      bufferedAudio,
    }),
  ).toBe(vadAudio);
});

test("falls back to buffered audio when VAD returns no samples", () => {
  const vadAudio = new Float32Array();
  const bufferedAudio = new Float32Array([0.2, 0.3]);

  expect(
    chooseCompletedSpeechAudio({
      vadAudio,
      bufferedAudio,
    }),
  ).toBe(bufferedAudio);
});
