// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { useNemotronStreamCapture } from "@/hooks/transcript/useTranscript/useNemotronStreamCapture";
import type { TranscriptionRuntime } from "@/lib/models/transcriptionRuntime";

const client = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  write: vi.fn((_worker: unknown, _audio: Float32Array) => new Promise<void>(() => {})),
  finish: vi.fn(async () => {}),
  abort: vi.fn(),
}));
vi.mock("@/lib/transcript/whisper/client", () => ({
  startStreamingTranscription: client.start,
  writeStreamingTranscription: client.write,
  finishStreamingTranscription: client.finish,
  abortStreamingTranscription: client.abort,
}));

const frame = (length: number) => new Float32Array(length).fill(0.1);

const setup = () => {
  const workerRef = { current: {} as Worker };
  const languageRef = { current: "auto" };
  const runtimeRef = {
    current: { modelId: "nemotron-3.5-asr-streaming-0.6b-int4" } as TranscriptionRuntime,
  };
  const { result } = renderHook(() =>
    useNemotronStreamCapture({ workerRef, runtimeRef, languageRef }),
  );
  return { result };
};

beforeEach(() => {
  vi.clearAllMocks();
  client.write.mockImplementation(() => new Promise<void>(() => {}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("flushes a 200ms/3,200-sample chunk once enough audio accumulates", () => {
  const { result } = setup();
  client.write.mockResolvedValue(undefined);

  act(() => {
    result.current.pushFrame(frame(1600));
    result.current.pushFrame(frame(1600));
  });

  expect(client.write).toHaveBeenCalledTimes(1);
  const sentAudio = client.write.mock.calls[0]?.[1] as Float32Array;
  expect(sentAudio.length).toBe(3_200);
});

test("drops chunks once 24 blocks are pending, instead of growing latency unboundedly", () => {
  const { result } = setup();

  act(() => {
    for (let i = 0; i < 30; i++) {
      result.current.pushFrame(frame(3_200));
    }
  });

  expect(client.write).toHaveBeenCalledTimes(24);
});

test("flushes the trailing partial chunk and finishes the session on stop", async () => {
  const { result } = setup();
  client.write.mockResolvedValue(undefined);

  act(() => {
    result.current.pushFrame(frame(1_000));
  });

  await act(async () => {
    await result.current.stop();
  });

  expect(client.write).toHaveBeenCalledTimes(1);
  const sentAudio = client.write.mock.calls[0]?.[1] as Float32Array;
  expect(sentAudio.length).toBe(1_000);
  expect(client.finish).toHaveBeenCalledOnce();
});

test("closes the audio context without opening a stream when worklet setup fails", async () => {
  const { result } = setup();
  const close = vi.fn(async () => {});
  class FailingAudioContext {
    readonly sampleRate = 16_000;
    readonly audioWorklet = {
      addModule: vi.fn(async () => {
        throw new Error("Worklet setup failed.");
      }),
    };
    readonly close = close;
  }
  vi.stubGlobal("AudioContext", FailingAudioContext);

  await act(async () => {
    await expect(result.current.start({} as MediaStream)).rejects.toThrow("Worklet setup failed.");
  });

  expect(close).toHaveBeenCalledOnce();
  expect(client.start).not.toHaveBeenCalled();
  expect(client.abort).not.toHaveBeenCalled();
});

test("aborts the opened stream and closes the audio graph when resume fails", async () => {
  const { result } = setup();
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const processor = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    port: { close: vi.fn(), onmessage: null },
  };
  const sink = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
  };
  const close = vi.fn(async () => {});
  class ResumeFailingAudioContext {
    readonly sampleRate = 16_000;
    readonly destination = {};
    readonly audioWorklet = { addModule: vi.fn(async () => {}) };
    readonly close = close;
    readonly createMediaStreamSource = vi.fn(() => source);
    readonly createGain = vi.fn(() => sink);
    readonly resume = vi.fn(async () => {
      throw new Error("Audio context resume failed.");
    });
  }
  class MockAudioWorkletNode {
    readonly connect = processor.connect;
    readonly disconnect = processor.disconnect;
    readonly port = processor.port;
  }
  vi.stubGlobal("AudioContext", ResumeFailingAudioContext);
  vi.stubGlobal("AudioWorkletNode", MockAudioWorkletNode);

  await act(async () => {
    await expect(result.current.start({} as MediaStream)).rejects.toThrow(
      "Audio context resume failed.",
    );
  });

  expect(client.start).toHaveBeenCalledOnce();
  expect(client.abort).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(source.disconnect).toHaveBeenCalledOnce();
  expect(processor.port.close).toHaveBeenCalledOnce();
  expect(processor.disconnect).toHaveBeenCalledOnce();
  expect(sink.disconnect).toHaveBeenCalledOnce();
});
