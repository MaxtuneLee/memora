// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { useTranscript } from "@/hooks/transcript/useTranscript";
import type { WhisperWorkerMessage } from "@/lib/transcript/whisper/client";

const state = vi.hoisted(() => ({
  query: vi.fn(),
  commit: vi.fn(),
  load: vi.fn(),
  directory: vi.fn(),
  microphone: vi.fn(),
  callback: undefined as ((message: WhisperWorkerMessage) => void) | undefined,
}));
vi.mock("@/livestore/store", () => ({ useAppStore: () => state }));
vi.mock("@memora/fs", () => ({ dir: state.directory }));
vi.mock("@ricky0123/vad-web", () => ({ MicVAD: { new: vi.fn() } }));
vi.mock("@/lib/library/fileService", () => ({ saveRecording: vi.fn() }));
vi.mock("@/lib/transcript/whisper/client", () => ({
  getOrCreateWhisperWorker: (ref: { current: unknown }) =>
    ref.current ?? (ref.current = { terminate: vi.fn() }),
  subscribeToWhisperWorker: (
    _worker: unknown,
    callback: (message: WhisperWorkerMessage) => void,
  ) => {
    state.callback = callback;
    return () => {
      state.callback = undefined;
    };
  },
  loadWhisperModel: state.load,
  generateWhisperTranscript: vi.fn(),
}));

const cloudRoute = {
  modelRouting: {
    transcription: {
      source: "cloud",
      providerId: "scribe-account",
      modelId: "scribe_v2_realtime",
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.query.mockReturnValue({});
  state.load.mockImplementation(() => state.callback?.({ status: "ready" }));
  state.directory.mockReturnValue({ exists: async () => false });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: state.microphone } });
});
afterEach(() => vi.unstubAllGlobals());

describe("recording feature selection", () => {
  test("cloud selection blocks local preparation and exposes an actionable error", async () => {
    state.query.mockReturnValue(cloudRoute);
    const { result } = renderHook(() => useTranscript());
    await act(async () => {
      await result.current.checkModelCache();
    });
    act(() => result.current.loadModel());
    expect(state.directory).not.toHaveBeenCalled();
    expect(state.load).not.toHaveBeenCalled();
    expect(state.microphone).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
    expect(result.current.loadingMessage).toContain("authenticated connection is not configured");
  });
  test("rechecks a changed selection before requesting microphone access", async () => {
    const { result } = renderHook(() => useTranscript());
    act(() => result.current.loadModel());
    expect(result.current.status).toBe("ready");
    state.query.mockReturnValue(cloudRoute);
    await act(async () => {
      await expect(result.current.handleStartRecording()).rejects.toThrow(
        "authenticated connection is not configured",
      );
    });
    expect(state.microphone).not.toHaveBeenCalled();
    expect(result.current.recording).toBe(false);
    expect(result.current.status).toBe("error");
  });
  test("retry after changing back to local clears the configuration error", () => {
    state.query.mockReturnValue(cloudRoute);
    const { result } = renderHook(() => useTranscript());
    act(() => result.current.loadModel());
    expect(result.current.status).toBe("error");
    state.query.mockReturnValue({});
    act(() => result.current.loadModel());
    expect(result.current.status).toBe("ready");
    expect(result.current.loadingMessage).toBe("");
    expect(state.load).toHaveBeenCalledOnce();
  });
});
