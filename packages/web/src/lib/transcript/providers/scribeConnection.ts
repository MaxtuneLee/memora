import type { ConnectTranscription } from "./realtime";

/** The host supplies a fresh single-use token; this module never receives a long-lived API key. */
export const createScribeConnection =
  (input: {
    resolveToken: (signal: AbortSignal) => Promise<string>;
    endpoint?: string;
  }): ConnectTranscription =>
  async (options, handlers, signal) => {
    signal.throwIfAborted();
    const url = new URL(input.endpoint ?? "wss://api.elevenlabs.io/v1/speech-to-text/realtime");
    if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash) {
      throw new Error("Use a secure WebSocket endpoint without credentials or query parameters.");
    }
    const token = await input.resolveToken(signal);
    signal.throwIfAborted();
    if (!token.trim()) throw new Error("The transcription token is missing.");
    url.searchParams.set("token", token);
    url.searchParams.set("model_id", options.modelId);
    url.searchParams.set("audio_format", `pcm_${options.sampleRate}`);
    url.searchParams.set("commit_strategy", "manual");
    url.searchParams.set("include_timestamps", String(options.timestamps === "word"));
    if (options.language && options.language !== "auto")
      url.searchParams.set("language_code", options.language);
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let connected = false;
      let disposed = false;
      const close = () => {
        if (disposed) return;
        disposed = true;
        signal.removeEventListener("abort", abort);
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        socket.close();
      };
      const abort = () => {
        close();
        reject(new DOMException("Transcription cancelled", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      socket.onmessage = (event) => {
        try {
          handlers.message(JSON.parse(String(event.data)));
        } catch {
          handlers.error();
        }
      };
      socket.onerror = () => {
        if (!connected) reject(new Error("Could not connect to Scribe."));
        handlers.error();
        close();
      };
      socket.onclose = () => {
        if (!connected) reject(new Error("Scribe closed before the connection was ready."));
        handlers.close();
        close();
      };
      socket.onopen = () => {
        connected = true;
        resolve({
          async send(message) {
            signal.throwIfAborted();
            if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 1024 * 1024) {
              throw new Error("The transcription connection cannot accept more audio.");
            }
            socket.send(JSON.stringify(message));
          },
          close,
        });
      };
    });
  };
