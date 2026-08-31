import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { LocalAsrEvent } from "@memora/local-model-runtime";

import {
  generateWhisperTranscript,
  getOrCreateWhisperWorker,
  subscribeToWhisperWorker,
  type WhisperWorkerMessage,
} from "@/lib/transcript/whisper/client";

const state = vi.hoisted(() => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/local-model/client", () => ({ localModelClient: state }));
beforeEach(() => vi.clearAllMocks());

describe("recording Whisper compatibility", () => {
  test("the existing recording caller receives one complete result through the provider adapter", async () => {
    state.transcribeAudio.mockImplementation(async function* (): AsyncGenerator<LocalAsrEvent> {
      yield { type: "transcript-delta", text: "hel" };
      yield {
        type: "transcript-complete",
        text: "hello",
        chunks: [{ text: "hello", timestamp: [0, 1] }],
      };
    });
    const worker = getOrCreateWhisperWorker({ current: null });
    const events: WhisperWorkerMessage[] = [];
    const off = subscribeToWhisperWorker(worker, (event) => events.push(event));
    generateWhisperTranscript(worker, { audio: new Float32Array(16000 * 31), language: "en" });
    await vi.waitFor(() => expect(events.at(-1)?.status).toBe("complete"));
    expect(state.transcribeAudio).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.status === "complete")).toEqual([
      {
        status: "complete",
        output: "hello hello",
        chunks: [
          { text: "hello", timestamp: [0, 1] },
          { text: "hello", timestamp: [30, 31] },
        ],
        audio_length: 16000 * 31,
      },
    ]);
    off();
    worker.terminate();
  });
  test("terminating a recording suppresses late model output", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    state.transcribeAudio.mockImplementation(async function* (): AsyncGenerator<LocalAsrEvent> {
      await gate;
      yield { type: "transcript-complete", text: "late" };
    });
    const worker = getOrCreateWhisperWorker({ current: null });
    const events: WhisperWorkerMessage[] = [];
    const off = subscribeToWhisperWorker(worker, (event) => events.push(event));
    generateWhisperTranscript(worker, { audio: new Float32Array(1600), language: "en" });
    await vi.waitFor(() => expect(state.transcribeAudio).toHaveBeenCalledOnce());
    worker.terminate();
    release();
    // Flush the async generator and the adapter's completion chain.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events.map((event) => event.status)).toEqual(["start"]);
    off();
  });
});
