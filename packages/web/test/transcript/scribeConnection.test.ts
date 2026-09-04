import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { createScribeConnection } from "@/lib/transcript/providers/scribeConnection";
import type { TranscriptionOptions } from "@/lib/transcript/providers/types";

const options: TranscriptionOptions = {
  modelId: "scribe_v2_realtime",
  sampleRate: 16000,
  timestamps: "word",
  segmentation: "manual",
  language: "en",
};
const handlers = () => ({ message: vi.fn(), error: vi.fn(), close: vi.fn() });
afterEach(() => vi.unstubAllGlobals());

describe("Scribe browser token connection", () => {
  test("rejects credentials embedded in an endpoint before resolving a token", async () => {
    const resolveToken = vi.fn(async () => "token");
    await expect(
      createScribeConnection({ resolveToken, endpoint: "wss://example.test/stt?api_key=secret" })(
        options,
        handlers(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("without credentials");
    expect(resolveToken).not.toHaveBeenCalled();
  });
  test("cancellation during token resolution never opens a socket", async () => {
    const controller = new AbortController();
    let resolveToken!: (token: string) => void;
    const Socket = vi.fn();
    vi.stubGlobal("WebSocket", Socket);
    const connect = createScribeConnection({
      resolveToken: () =>
        new Promise((resolve) => {
          resolveToken = resolve;
        }),
    });
    const opening = connect(options, handlers(), controller.signal);
    controller.abort();
    resolveToken("single-use-token");
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(Socket).not.toHaveBeenCalled();
  });
  test("uses a fresh single-use token and removes listeners on abort", async () => {
    class FakeSocket {
      static OPEN = 1;
      static instances: FakeSocket[] = [];
      readyState = 1;
      bufferedAmount = 0;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();
      send = vi.fn();
      readonly url: URL;
      constructor(url: URL) {
        this.url = url;
        FakeSocket.instances.push(this);
      }
    }
    vi.stubGlobal("WebSocket", FakeSocket);
    const callbacks = handlers();
    const controller = new AbortController();
    const opening = createScribeConnection({ resolveToken: async () => "single-use-token" })(
      options,
      callbacks,
      controller.signal,
    );
    await Promise.resolve();
    const socket = FakeSocket.instances[0];
    expect(socket.url.searchParams.get("token")).toBe("single-use-token");
    expect(socket.url.searchParams.get("audio_format")).toBe("pcm_16000");
    expect(socket.url.searchParams.get("include_timestamps")).toBe("true");
    socket.onopen?.();
    const connection = await opening;
    socket.onmessage?.({ data: '{"message_type":"session_started"}' });
    expect(callbacks.message).toHaveBeenCalledWith({ message_type: "session_started" });
    controller.abort();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.onmessage).toBeNull();
    await expect(connection.send({ message_type: "input_audio_chunk" })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
