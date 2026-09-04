import {
  validateAudioSamples,
  validateTranscriptionOptions,
  type TranscriptionEvent,
  type TranscriptionOptions,
  type TranscriptionProvider,
  type TranscriptionSession,
  type TranscriptSegment,
} from "./types";

export interface TranscriptionConnection {
  send(message: Record<string, unknown>): Promise<void>;
  close(): void;
}

/** Authentication is supplied by the client caller; never serialize it in transcript events. */
export type ConnectTranscription = (
  options: TranscriptionOptions,
  handlers: { message: (value: unknown) => void; close: () => void; error: () => void },
  signal: AbortSignal,
) => Promise<TranscriptionConnection>;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const time = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

export const encodePcm16 = (samples: Float32Array): string => {
  validateAudioSamples(samples);
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(""));
};

const delay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Transcription cancelled", "AbortError"));
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      Math.max(0, ms),
    );
    signal.addEventListener("abort", abort, { once: true });
  });

interface RealtimeProviderDependencies {
  connect: ConnectTranscription;
  /** Real providers are paced. Tests can inject a deterministic clock. */
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}

export const createScribeTranscriptionProvider = (
  dependencies: RealtimeProviderDependencies,
): TranscriptionProvider => ({
  adapterId: "elevenlabs-scribe",
  getCapabilities(modelId) {
    if (modelId !== "scribe_v2_realtime") {
      throw new Error("This model is not supported by the selected transcription adapter.");
    }
    return {
      sampleRates: [8000, 16000, 22050, 24000, 44100, 48000],
      // Scribe manual commits give finish() an explicit set of pending results to drain.
      segmentation: ["manual"],
      timestamps: ["none", "word"],
      partialResults: true,
    };
  },
  async open(options, onEvent) {
    validateTranscriptionOptions(options, this.getCapabilities(options.modelId));
    const controller = new AbortController();
    let connection: TranscriptionConnection | undefined;
    let closed = false;
    let ready = false;
    let finishing = false;
    let endSent = false;
    let dirtySamples = 0;
    let pendingCommits = 0;
    let ordinal = 0;
    let queuedSamples = 0;
    let failure: Error | undefined;
    const sessionId = crypto.randomUUID();
    const segments = new Map<string, TranscriptSegment>();
    const awaitingWords: string[] = [];
    let queue = Promise.resolve();
    let finishPromise: Promise<void> | undefined;
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    let resolveFinished!: () => void;
    let rejectFinished!: (error: Error) => void;
    let rejectStopped!: (error: Error) => void;
    const stopped = new Promise<never>((_, reject) => {
      rejectStopped = reject;
    });
    void stopped.catch(() => {});
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const finishedPromise = new Promise<void>((resolve, reject) => {
      resolveFinished = resolve;
      rejectFinished = reject;
    });
    // These may reject while the caller is still writing audio, before finish().
    void readyPromise.catch(() => {});
    void finishedPromise.catch(() => {});
    let timer: ReturnType<typeof setTimeout>;
    const emit = (event: TranscriptionEvent) => {
      if (!closed) onEvent(event);
    };
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      controller.abort();
      connection?.close();
      onEvent({ type: "state", state: "closed" });
    };
    const fail = (code: string, retryable = true) => {
      if (closed) return;
      failure = new Error(`Transcription failed (${code}). Check the selected provider and retry.`);
      emit({ type: "error", code, message: failure.message, retryable });
      rejectReady(failure);
      rejectFinished(failure);
      rejectStopped(failure);
      close();
    };
    const abort = () => {
      if (closed) return;
      failure = new DOMException("Transcription cancelled", "AbortError");
      rejectReady(failure);
      rejectFinished(failure);
      rejectStopped(failure);
      close();
    };
    const check = () => {
      if (failure) throw failure;
      controller.signal.throwIfAborted();
    };
    const maybeComplete = () => {
      if (!closed && finishing && endSent && pendingCommits === 0 && awaitingWords.length === 0) {
        resolveFinished();
        close();
      }
    };
    const update = (id: string, value: Omit<TranscriptSegment, "id" | "revision">) => {
      const previous = segments.get(id);
      if (previous?.isFinal && !value.isFinal) return;
      const segment = { ...previous, ...value, id, revision: (previous?.revision ?? 0) + 1 };
      segments.set(id, segment);
      emit({ type: "segment", segment });
    };
    const receive = (value: unknown) => {
      if (closed) return;
      try {
        const event = record(value);
        const type = text(event.message_type);
        if (type === "session_started") {
          if (!ready) {
            ready = true;
            emit({ type: "state", state: "ready" });
            resolveReady();
          }
        } else if (
          type === "error" ||
          type.endsWith("_error") ||
          [
            "quota_exceeded",
            "rate_limited",
            "queue_overflow",
            "resource_exhausted",
            "commit_throttled",
            "invalid_request",
            "session_time_limit_exceeded",
            "chunk_size_exceeded",
            "insufficient_audio_activity",
            "unaccepted_terms",
          ].includes(type)
        ) {
          fail(type === "auth_error" ? "authentication" : "provider_error", type !== "auth_error");
        } else if (type === "partial_transcript") {
          update(`${sessionId}:${ordinal}`, { text: text(event.text), isFinal: false });
        } else if (type === "committed_transcript") {
          const id = `${sessionId}:${ordinal++}`;
          update(id, { text: text(event.text), isFinal: true });
          pendingCommits = Math.max(0, pendingCommits - 1);
          if (options.timestamps === "word") awaitingWords.push(id);
        } else if (
          type === "committed_transcript_with_timestamps" &&
          options.timestamps === "word"
        ) {
          const match = awaitingWords.findIndex(
            (id) => segments.get(id)?.text === text(event.text),
          );
          if (match < 0 || !Array.isArray(event.words)) return fail("invalid_timestamps");
          const [id] = awaitingWords.splice(match, 1);
          const words = event.words.map((raw) => {
            const word = record(raw);
            return {
              text: text(word.text),
              startSeconds: time(word.start),
              endSeconds: time(word.end),
            };
          });
          if (
            words.some(
              (word) =>
                word.startSeconds !== undefined &&
                word.endSeconds !== undefined &&
                word.endSeconds < word.startSeconds,
            )
          )
            return fail("invalid_timestamps");
          update(id, { text: text(event.text), isFinal: true, words });
        }
        maybeComplete();
      } catch {
        fail("invalid_response");
      }
    };
    const send = async (message: Record<string, unknown>) => {
      check();
      if (!connection) throw new Error("Transcription connection is unavailable.");
      await Promise.race([connection.send(message), stopped]);
    };
    const commit = async () => {
      if (!dirtySamples) return;
      dirtySamples = 0;
      pendingCommits++;
      await send({
        message_type: "input_audio_chunk",
        audio_base_64: "",
        commit: true,
        sample_rate: options.sampleRate,
      });
    };
    const enqueue = (operation: () => Promise<void>) => {
      const task = queue.then(async () => {
        check();
        try {
          await operation();
        } catch {
          if (!closed) fail("transport_error");
          throw failure ?? new Error("Transcription transport failed.");
        }
      });
      queue = task.catch(() => {});
      return task;
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => fail("connection_timeout"), dependencies.timeoutMs ?? 30000);
    try {
      const connecting = dependencies
        .connect(
          options,
          {
            message: receive,
            close: () => fail("connection_closed"),
            error: () => fail("transport_error"),
          },
          controller.signal,
        )
        .then((opened) => {
          if (closed) opened.close();
          return opened;
        });
      connection = await Promise.race([connecting, stopped]);
      if (closed) {
        connection.close();
        check();
      }
      await readyPromise;
      check();
      clearTimeout(timer);
    } catch {
      if (!closed) fail("connection_failed");
      throw failure ?? new Error("Could not connect to the transcription provider.");
    }
    const session: TranscriptionSession = {
      write(samples) {
        if (finishing || closed)
          return Promise.reject(
            failure ?? new Error("The transcription session is not accepting audio."),
          );
        validateAudioSamples(samples);
        if (queuedSamples + samples.length > options.sampleRate * 30)
          return Promise.reject(
            new Error("Audio queue is full. Await write() before sending more audio."),
          );
        queuedSamples += samples.length;
        const snapshot = samples.slice();
        return enqueue(async () => {
          try {
            const frameSize = Math.floor(options.sampleRate / 10);
            for (let offset = 0; offset < snapshot.length; offset += frameSize) {
              const frame = snapshot.subarray(offset, offset + frameSize);
              const audio = encodePcm16(frame);
              dirtySamples += frame.length;
              await send({
                message_type: "input_audio_chunk",
                audio_base_64: audio,
                sample_rate: options.sampleRate,
              });
              await Promise.race([
                (dependencies.wait ?? delay)(
                  (frame.length / options.sampleRate) * 1000,
                  controller.signal,
                ),
                stopped,
              ]);
              if (options.segmentation === "manual" && dirtySamples >= options.sampleRate * 20)
                await commit();
            }
          } finally {
            queuedSamples -= snapshot.length;
          }
        });
      },
      ...(options.segmentation === "manual"
        ? {
            commit: () =>
              finishing || closed
                ? Promise.reject(
                    failure ?? new Error("The transcription session is not accepting commits."),
                  )
                : enqueue(commit),
          }
        : {}),
      finish() {
        if (finishPromise) return finishPromise;
        finishing = true;
        emit({ type: "state", state: "draining" });
        finishPromise = enqueue(async () => {
          timer = setTimeout(() => fail("final_result_timeout"), dependencies.timeoutMs ?? 30000);
          if (options.segmentation === "manual") await commit();
          endSent = true;
          maybeComplete();
          await finishedPromise;
        });
        return finishPromise;
      },
      abort,
    };
    return session;
  },
});
