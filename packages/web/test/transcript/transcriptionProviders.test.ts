import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { createWhisperTranscriptionProvider } from "@/lib/transcript/providers/whisper";
import {
  createScribeTranscriptionProvider,
  encodePcm16,
  type ConnectTranscription,
} from "@/lib/transcript/providers/realtime";
import { transcribePcm } from "@/lib/transcript/providers/transcribePcm";
import { toRecordingTranscript } from "@/lib/transcript/providers/toRecordingTranscript";
import { TranscriptionProviderRegistry } from "@/lib/transcript/providers/registry";
import type { TranscriptionEvent, TranscriptionOptions } from "@/lib/transcript/providers/types";
import type { LocalAsrEvent } from "@memora/local-model-runtime";

const options: TranscriptionOptions = {
  modelId: "whisper-base-timestamped",
  sampleRate: 16000,
  segmentation: "manual",
  timestamps: "word",
  language: "en",
};
afterEach(() => vi.useRealTimers());

const remote = (timestamps: "none" | "word" = "none", timeoutMs = 1000) => {
  let handlers: Parameters<ConnectTranscription>[1] | undefined;
  const events: TranscriptionEvent[] = [];
  const sent: Record<string, unknown>[] = [];
  const close = vi.fn();
  const connect: ConnectTranscription = vi.fn(async (_options, callbacks) => {
    handlers = callbacks;
    callbacks.message({ message_type: "session_started" });
    return {
      close,
      send: async (message: Record<string, unknown>) => {
        sent.push(message);
      },
    };
  });
  const provider = createScribeTranscriptionProvider({
    connect,
    wait: async () => {},
    timeoutMs,
  });
  return {
    provider,
    events,
    sent,
    close,
    connect,
    open: () =>
      provider.open(
        {
          ...options,
          modelId: "scribe_v2_realtime",
          timestamps,
        },
        (event) => events.push(event),
      ),
    receive: (value: unknown) => handlers?.message(value),
    disconnect: () => handlers?.close(),
  };
};

describe("local transcription adapter", () => {
  test("splits long audio and offsets word timestamps across chunks", async () => {
    const calls: number[] = [];
    const provider = createWhisperTranscriptionProvider({
      async *transcribeAudio(request): AsyncGenerator<LocalAsrEvent> {
        calls.push(request.audio.length);
        yield { type: "transcript-delta", text: "hel" };
        yield {
          type: "transcript-complete",
          text: "hello",
          chunks: [{ text: "hello", timestamp: [0, 1] }],
        };
      },
    });
    const result = await transcribePcm(provider, new Float32Array(16000 * 41), options);
    expect(calls).toEqual([320000, 320000, 16000]);
    expect(result).toHaveLength(3);
    expect(result.map((segment) => segment.words?.[0].startSeconds)).toEqual([0, 20, 40]);
    expect(result.every((segment) => segment.isFinal && segment.revision === 2)).toBe(true);
  });
  test("finish flushes the tail once and rejects later writes", async () => {
    const events: TranscriptionEvent[] = [];
    const run = vi.fn(async function* (): AsyncGenerator<LocalAsrEvent> {
      yield { type: "transcript-complete", text: "tail" };
    });
    const session = await createWhisperTranscriptionProvider({ transcribeAudio: run }).open(
      options,
      (event) => events.push(event),
    );
    await session.write(new Float32Array(1600));
    await Promise.all([session.finish(), session.finish()]);
    expect(run).toHaveBeenCalledOnce();
    expect(
      events.filter((event) => event.type === "state" && event.state === "closed"),
    ).toHaveLength(1);
    await expect(session.write(new Float32Array(10))).rejects.toThrow("not accepting");
  });
  test("abort discards buffered audio and suppresses later output", async () => {
    const run = vi.fn(async function* (): AsyncGenerator<LocalAsrEvent> {
      yield { type: "transcript-complete", text: "unexpected" };
    });
    const session = await createWhisperTranscriptionProvider({ transcribeAudio: run }).open(
      options,
      () => {},
    );
    await session.write(new Float32Array(1600));
    session.abort();
    await expect(session.finish()).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
});

describe("realtime protocol adapters", () => {
  test("an unresponsive connector times out and its late connection is closed", async () => {
    vi.useFakeTimers();
    let resolveConnection!: (connection: Awaited<ReturnType<ConnectTranscription>>) => void;
    const close = vi.fn();
    const provider = createScribeTranscriptionProvider({
      connect: () =>
        new Promise((resolve) => {
          resolveConnection = resolve;
        }),
      timeoutMs: 100,
    });
    const opening = provider.open(
      { ...options, modelId: "scribe_v2_realtime", timestamps: "none" },
      () => {},
    );
    const rejected = expect(opening).rejects.toThrow("connection_timeout");
    await vi.advanceTimersByTimeAsync(101);
    await rejected;
    resolveConnection({ close, send: async () => {} });
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
  });
  test("abort cancels opening even when token resolution ignores its signal", async () => {
    const controller = new AbortController();
    const provider = createScribeTranscriptionProvider({ connect: () => new Promise(() => {}) });
    const opening = provider.open(
      { ...options, modelId: "scribe_v2_realtime", signal: controller.signal },
      () => {},
    );
    controller.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
  });
  test("encodes clipped signed little-endian PCM16", () => {
    const bytes = Uint8Array.from(atob(encodePcm16(new Float32Array([-2, 0, 2]))), (char) =>
      char.charCodeAt(0),
    );
    expect([...bytes]).toEqual([0, 128, 0, 0, 255, 127]);
    expect(() => encodePcm16(new Float32Array([NaN]))).toThrow("invalid samples");
  });
  test("Scribe rejects unsupported models before opening a connection", async () => {
    const api = remote();
    await expect(
      api.provider.open({ ...options, modelId: "unsupported-asr" }, () => {}),
    ).rejects.toThrow("not supported");
    expect(api.connect).not.toHaveBeenCalled();
  });
  test("Scribe replaces partial text and waits for the final result before closing", async () => {
    const api = remote();
    const session = await api.open();
    await session.write(new Float32Array(32000));
    api.receive({ message_type: "partial_transcript", text: "hel" });
    api.receive({ message_type: "partial_transcript", text: "hello wor" });
    const finish = session.finish();
    await vi.waitFor(() => expect(api.sent.at(-1)?.commit).toBe(true));
    expect(api.close).not.toHaveBeenCalled();
    api.receive({ message_type: "committed_transcript", text: "hello world" });
    await finish;
    const segments = api.events.filter((event) => event.type === "segment");
    expect(segments.map((event) => event.segment.text)).toEqual([
      "hel",
      "hello wor",
      "hello world",
    ]);
    expect(new Set(segments.map((event) => event.segment.id)).size).toBe(1);
    expect(segments.map((event) => event.segment.revision)).toEqual([1, 2, 3]);
    expect(api.close).toHaveBeenCalledOnce();
  });
  test("Scribe enriches the same final segment with delayed timestamps", async () => {
    const api = remote("word");
    const session = await api.open();
    await session.write(new Float32Array(32000));
    api.receive({ message_type: "partial_transcript", text: "hel" });
    const finish = session.finish();
    await vi.waitFor(() => expect(api.sent.at(-1)?.commit).toBe(true));
    api.receive({ message_type: "committed_transcript", text: "hello" });
    expect(api.close).not.toHaveBeenCalled();
    api.receive({
      message_type: "committed_transcript_with_timestamps",
      text: "hello",
      words: [{ text: "hello", start: 0, end: 0.5 }],
    });
    await finish;
    const segments = api.events.filter((event) => event.type === "segment");
    expect(new Set(segments.map((event) => event.segment.id)).size).toBe(1);
    expect(segments.at(-1)?.segment.words).toEqual([
      { text: "hello", startSeconds: 0, endSeconds: 0.5 },
    ]);
    expect(api.close).toHaveBeenCalledOnce();
  });
  test("unexpected disconnect fails pending finish without exposing provider errors", async () => {
    const api = remote();
    const session = await api.open();
    await session.write(new Float32Array(32000));
    const finish = session.finish();
    const rejected = expect(finish).rejects.toThrow("connection_closed");
    await vi.waitFor(() => expect(api.sent.at(-1)?.commit).toBe(true));
    api.disconnect();
    await rejected;
  });
  test("provider errors do not echo secret-bearing payloads", async () => {
    const api = remote();
    const session = await api.open();
    api.receive({ message_type: "auth_error", error: "secret-key-example" });
    await expect(session.finish()).rejects.toThrow("authentication");
    expect(JSON.stringify(api.events)).not.toContain("secret-key-example");
  });
  test("finish times out instead of treating missing final output as success", async () => {
    vi.useFakeTimers();
    const api = remote("word", 100);
    const session = await api.open();
    await session.write(new Float32Array(1600));
    const finish = session.finish();
    const rejected = expect(finish).rejects.toThrow("final_result_timeout");
    await vi.advanceTimersByTimeAsync(101);
    await rejected;
    expect(api.close).toHaveBeenCalledOnce();
  });
});

describe("transcription consumers", () => {
  test("preserves untimed text without invented seek positions", () => {
    expect(
      toRecordingTranscript([
        { id: "1", revision: 1, isFinal: true, text: "hello" },
        { id: "2", revision: 1, isFinal: false, text: "draft" },
        {
          id: "3",
          revision: 1,
          isFinal: true,
          text: "world",
          words: [
            { text: "world", startSeconds: 2, endSeconds: 3 },
            { text: "invalid", startSeconds: 4, endSeconds: 1 },
            { text: "unknown" },
          ],
        },
      ]),
    ).toEqual({ text: "hello world", words: [{ text: "world", timestamp: [2, 3] }] });
  });
  test("registry requires explicit registration and never falls back", () => {
    const registry = new TranscriptionProviderRegistry();
    const provider = createWhisperTranscriptionProvider();
    registry.register(provider);
    expect(registry.get(provider.adapterId)).toBe(provider);
    expect(() => registry.get("unknown")).toThrow("not configured");
    expect(() => registry.register(provider)).toThrow("already registered");
  });
});
