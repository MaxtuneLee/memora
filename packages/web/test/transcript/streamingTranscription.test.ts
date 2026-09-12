import { expect, test, vi } from "vite-plus/test";

import {
  finishStreamingTranscription,
  getOrCreateWhisperWorker,
  startStreamingTranscription,
  subscribeToWhisperWorker,
  writeStreamingTranscription,
  type WhisperWorkerMessage,
} from "@/lib/transcript/whisper/client";
import type { TranscriptionRuntime } from "@/lib/models/transcriptionRuntime";
import type { TranscriptionEvent } from "@/lib/transcript/providers/types";

test("keeps one streaming session open across PCM frames", async () => {
  let onEvent: ((event: TranscriptionEvent) => void) | undefined;
  const write = vi.fn(async () => undefined);
  const finish = vi.fn(async () => {
    onEvent?.({
      type: "segment",
      segment: {
        id: "recording",
        revision: 1,
        text: "hello world",
        isFinal: true,
        words: [
          { text: "hello", startSeconds: 0, endSeconds: 0.2 },
          { text: "world", startSeconds: 0.2, endSeconds: 0.4 },
        ],
      },
    });
  });
  const abort = vi.fn();
  const runtime = {
    modelId: "nemotron-3.5-asr-streaming-0.6b-int4",
    timestamps: "word",
    provider: {
      getCapabilities: vi.fn(),
      open: vi.fn(async (_options: unknown, callback: (event: TranscriptionEvent) => void) => {
        onEvent = callback;
        return { write, finish, abort };
      }),
    },
  } as unknown as TranscriptionRuntime;
  const workerRef = { current: null as Worker | null };
  const worker = getOrCreateWhisperWorker(workerRef);
  const messages: WhisperWorkerMessage[] = [];
  const unsubscribe = subscribeToWhisperWorker(worker, (message) => messages.push(message));

  await startStreamingTranscription(worker, runtime, "auto");
  await writeStreamingTranscription(worker, new Float32Array([0.1, 0.2]));
  await writeStreamingTranscription(worker, new Float32Array([0.3]));
  await finishStreamingTranscription(worker);

  expect(runtime.provider.open).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledTimes(2);
  expect(finish).toHaveBeenCalledOnce();
  expect(messages).toContainEqual({ status: "start" });
  expect(messages).toContainEqual(
    expect.objectContaining({
      status: "complete",
      output: "hello world",
      audio_length: 3,
      streaming: true,
    }),
  );

  unsubscribe();
});
