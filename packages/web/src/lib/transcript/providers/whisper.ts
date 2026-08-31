import { localModelClient, type LocalModelClient } from "@/lib/local-model/client";
import {
  validateAudioSamples,
  validateTranscriptionOptions,
  type TranscriptionProvider,
  type TranscriptionSession,
  type TranscriptSegment,
} from "./types";

export const createWhisperTranscriptionProvider = (
  client: Pick<LocalModelClient, "transcribeAudio"> = localModelClient,
): TranscriptionProvider => ({
  adapterId: "whisper-local",
  getCapabilities(modelId) {
    if (modelId !== "whisper-base-timestamped")
      throw new Error("Unsupported local transcription model.");
    return {
      sampleRates: [16000],
      segmentation: ["manual"],
      timestamps: ["none", "segment", "word"],
      partialResults: true,
    };
  },
  async open(options, onEvent) {
    validateTranscriptionOptions(options, this.getCapabilities(options.modelId));
    const controller = new AbortController();
    const sessionId = crypto.randomUUID();
    const windowSize = options.sampleRate * 30;
    let buffer = new Float32Array(windowSize);
    let buffered = 0;
    let position = 0;
    let ordinal = 0;
    let closed = false;
    let finishing = false;
    let failure: Error | null = null;
    let queue = Promise.resolve();
    let finishPromise: Promise<void> | undefined;
    const emit = (event: Parameters<typeof onEvent>[0]) => {
      if (!closed) onEvent(event);
    };
    const close = () => {
      if (closed) return;
      closed = true;
      options.signal?.removeEventListener("abort", abort);
      onEvent({ type: "state", state: "closed" });
    };
    const abort = () => {
      controller.abort();
      buffer = new Float32Array();
      buffered = 0;
      close();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const check = () => {
      controller.signal.throwIfAborted();
      if (failure) throw failure;
      if (closed) throw new Error("The transcription session is closed.");
    };
    const enqueue = (operation: () => Promise<void>) => {
      const task = queue.then(async () => {
        check();
        await operation();
      });
      queue = task.catch(() => {
        if (!closed) {
          failure = new Error("Local transcription failed. Retry with the selected model.");
          emit({
            type: "error",
            code: "transcription_failed",
            message: failure.message,
            retryable: true,
          });
          controller.abort();
          close();
        }
      });
      return task;
    };
    const flush = async () => {
      if (!buffered) return;
      const audio = buffer.slice(0, buffered);
      const startSeconds = position / options.sampleRate;
      position += buffered;
      buffered = 0;
      const id = `${sessionId}:${ordinal++}`;
      let revision = 0;
      let completed = false;
      for await (const event of client.transcribeAudio(
        {
          modelId: options.modelId,
          audio,
          language: options.language || "auto",
          ...(options.timestamps === "word" ? { returnTimestamps: "word" as const } : {}),
        },
        { signal: controller.signal, priority: "interactive" },
      )) {
        check();
        if (event.type === "error") throw new Error("Local transcription failed.");
        if (event.type === "model-progress")
          emit({
            type: "progress",
            label: event.file ?? "Loading Whisper",
            progress: event.progress,
          });
        if (event.type === "transcript-delta" || event.type === "transcript-complete") {
          const segment: TranscriptSegment = {
            id,
            revision: ++revision,
            text: event.text,
            isFinal: event.type === "transcript-complete",
          };
          if (options.timestamps !== "none") {
            segment.startSeconds = startSeconds;
            segment.endSeconds = startSeconds + audio.length / options.sampleRate;
          }
          if (event.type === "transcript-complete") {
            completed = true;
            if (options.timestamps === "word")
              segment.words = event.chunks?.map((word) => ({
                text: word.text,
                startSeconds: startSeconds + word.timestamp[0],
                endSeconds: startSeconds + word.timestamp[1],
              }));
          }
          emit({ type: "segment", segment });
        }
      }
      check();
      if (!completed) throw new Error("Whisper ended without a final transcript.");
    };
    const session: TranscriptionSession = {
      write(samples) {
        if (finishing || closed)
          return Promise.reject(new Error("The transcription session is not accepting audio."));
        validateAudioSamples(samples);
        const snapshot = samples.slice();
        return enqueue(async () => {
          for (let offset = 0; offset < snapshot.length;) {
            const count = Math.min(windowSize - buffered, snapshot.length - offset);
            buffer.set(snapshot.subarray(offset, offset + count), buffered);
            buffered += count;
            offset += count;
            if (buffered === windowSize) await flush();
          }
        });
      },
      commit() {
        if (finishing || closed)
          return Promise.reject(new Error("The transcription session is not accepting commits."));
        return enqueue(flush);
      },
      finish() {
        if (finishPromise) return finishPromise;
        finishing = true;
        emit({ type: "state", state: "draining" });
        finishPromise = enqueue(async () => {
          await flush();
          check();
          buffer = new Float32Array();
          close();
        });
        return finishPromise;
      },
      abort,
    };
    options.signal?.throwIfAborted();
    emit({ type: "state", state: "ready" });
    return session;
  },
});
