// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, test, vi } from "vite-plus/test";

import { useFileTranscription } from "@/hooks/transcript/useFileTranscription";
import type { TranscriptionEvent, TranscriptionProvider } from "@/lib/transcript/providers/types";
import type { RecordingMeta } from "@/types/library";

const state = vi.hoisted(() => ({
  commit: vi.fn(),
  query: vi.fn(),
  write: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/livestore/store", () => ({ useAppStore: () => state }));
vi.mock("@memora/fs", () => ({ write: state.write }));
vi.mock("@/lib/library/fileStorage", () => ({ resolveAudioBlob: state.resolve }));

const meta: RecordingMeta = {
  id: "audio",
  name: "Audio",
  type: "audio",
  mimeType: "audio/wav",
  sizeBytes: 100,
  storageType: "opfs",
  storagePath: "/audio.wav",
  metaPath: "/audio.meta.json",
  createdAt: 0,
  updatedAt: 0,
};
const makeRuntime = () => {
  let emit: (event: TranscriptionEvent) => void = () => {};
  const abort = vi.fn();
  const write = vi.fn(async () => {});
  const finish = vi.fn(async () =>
    emit({
      type: "segment",
      segment: { id: "one", revision: 1, text: "hello world", isFinal: true },
    }),
  );
  const open = vi.fn<TranscriptionProvider["open"]>(async (_options, onEvent) => {
    emit = onEvent;
    return { abort, write, finish };
  });
  const provider: TranscriptionProvider = {
    adapterId: "test-provider",
    getCapabilities: () => ({
      sampleRates: [16000],
      segmentation: ["manual"],
      timestamps: ["none"],
      partialResults: true,
    }),
    open,
  };
  return {
    provider,
    modelId: "test-model",
    timestamps: "none" as const,
    abort,
    write,
    finish,
    open,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  state.query.mockReturnValue({});
  state.write.mockResolvedValue(undefined);
  state.resolve.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(10) });
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData() {
        return {
          numberOfChannels: 1,
          length: 1600,
          copyFromChannel: (output: Float32Array) => output.fill(0.1),
        };
      }
      async close() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("file transcription provider integration", () => {
  test("reads the feature selection at click time and reports unavailable cloud before reading audio", async () => {
    const { result } = renderHook(() => useFileTranscription());
    expect(state.query).not.toHaveBeenCalled();
    state.query.mockReturnValue({
      modelRouting: {
        transcription: {
          source: "cloud",
          providerId: "scribe-account",
          modelId: "scribe_v2_realtime",
        },
      },
    });
    await act(async () => {
      await expect(result.current.transcribeFile(meta)).rejects.toThrow(
        "authenticated connection is not configured",
      );
    });
    expect(state.query).toHaveBeenCalledOnce();
    expect(state.resolve).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
  });
  test("uses the supplied provider and saves untimed text through the existing file event", async () => {
    const runtime = makeRuntime();
    const { result } = renderHook(() => useFileTranscription(runtime));
    await act(async () => {
      await expect(result.current.transcribeFile(meta)).resolves.toEqual({
        text: "hello world",
        words: [],
      });
    });
    expect(runtime.open).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "test-model", timestamps: "none", sampleRate: 16000 }),
      expect.any(Function),
    );
    expect(runtime.finish).toHaveBeenCalledOnce();
    expect(runtime.abort).toHaveBeenCalledOnce();
    expect(JSON.parse(state.write.mock.calls[0][1])).toEqual({ text: "hello world", words: [] });
    expect(state.commit).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("complete");
  });
  test("reset during decoding cancels the run before opening a provider or saving", async () => {
    let resolveBlob!: (value: unknown) => void;
    state.resolve.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBlob = resolve;
        }),
    );
    const runtime = makeRuntime();
    const { result } = renderHook(() => useFileTranscription(runtime));
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.transcribeFile(meta);
    });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    act(() => result.current.reset());
    await act(async () => {
      resolveBlob(new Blob());
      await rejected;
    });
    expect(runtime.open).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });
  test("a provider failure is reported without saving or selecting another provider", async () => {
    const runtime = makeRuntime();
    runtime.open.mockRejectedValue(new Error("Selected provider unavailable"));
    const { result } = renderHook(() => useFileTranscription(runtime));
    await act(async () => {
      await expect(result.current.transcribeFile(meta)).rejects.toThrow(
        "Selected provider unavailable",
      );
    });
    expect(runtime.open).toHaveBeenCalledOnce();
    expect(state.write).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
  });
});
