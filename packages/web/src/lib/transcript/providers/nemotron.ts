import { isNemotronAsrModel } from "@memora/local-model-runtime";

import { localModelClient, type LocalModelClient } from "@/lib/local-model/client";
import {
  validateAudioSamples,
  validateTranscriptionOptions,
  type TranscriptionProvider,
  type TranscriptionSession,
} from "./types";

export const createNemotronTranscriptionProvider = (
  client: Pick<LocalModelClient, "openAsrStream"> = localModelClient,
): TranscriptionProvider => ({
  adapterId: "nemotron-local",
  getCapabilities(modelId) {
    if (!isNemotronAsrModel(modelId)) throw new Error("Unsupported local transcription model.");
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
    const id = crypto.randomUUID();
    const stream = client.openAsrStream(
      {
        modelId: options.modelId,
        language: options.language ?? "auto",
        ...(options.timestamps === "word" ? { returnTimestamps: "word" as const } : {}),
      },
      { priority: "interactive", signal: controller.signal },
    );
    let closed = false;
    let finishing = false;
    let revision = 0;
    let latestText = "";
    const close = () => {
      if (closed) return;
      closed = true;
      options.signal?.removeEventListener("abort", abort);
      onEvent({ type: "state", state: "closed" });
    };
    const fail = (message: string) => {
      if (closed) return;
      onEvent({ type: "error", code: "transcription_failed", message, retryable: true });
      controller.abort();
      close();
    };
    const consume = (async () => {
      try {
        for await (const event of stream.events) {
          if (closed) return;
          if (event.type === "error") {
            fail(event.error.message);
            return;
          }
          if (event.type === "model-progress") {
            onEvent({
              type: "progress",
              label: event.file ?? "Loading Nemotron",
              progress: event.progress,
            });
          }
          if (event.type === "transcript-delta" || event.type === "transcript-complete") {
            latestText = event.text;
            onEvent({
              type: "segment",
              segment: {
                id,
                revision: ++revision,
                text: latestText,
                isFinal: event.type === "transcript-complete",
                ...(event.type === "transcript-complete" && options.timestamps !== "none"
                  ? { startSeconds: 0, endSeconds: (event.audioLength ?? 0) / 16_000 }
                  : {}),
                ...(event.type === "transcript-complete" && options.timestamps === "word"
                  ? {
                      words: event.chunks?.map((word) => ({
                        text: word.text,
                        startSeconds: word.timestamp[0],
                        endSeconds: word.timestamp[1],
                      })),
                    }
                  : {}),
              },
            });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted)
          fail(error instanceof Error ? error.message : "Nemotron transcription failed.");
      }
    })();
    const abort = () => {
      controller.abort();
      stream.abort();
      close();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    options.signal?.throwIfAborted();
    onEvent({ type: "state", state: "ready" });
    const session: TranscriptionSession = {
      async write(samples) {
        if (closed || finishing)
          throw new Error("The transcription session is not accepting audio.");
        validateAudioSamples(samples);
        await stream.write(samples.slice());
      },
      async finish() {
        if (closed) return;
        finishing = true;
        onEvent({ type: "state", state: "draining" });
        await stream.close();
        await consume;
        if (!closed) close();
      },
      abort,
    };
    return session;
  },
});
