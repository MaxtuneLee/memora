import type { MutableRefObject } from "react";

import type { LocalModelEvent } from "@memora/local-model-runtime";
import { localModelClient } from "@/lib/local-model";
import type { TranscriptionRuntime } from "@/lib/models/transcriptionRuntime";
import { createWhisperTranscriptionProvider } from "@/lib/transcript/providers/whisper";
import { toRecordingTranscript } from "@/lib/transcript/providers/toRecordingTranscript";
import type {
  TranscriptSegment,
  TranscriptionEvent,
  TranscriptionSession,
} from "@/lib/transcript/providers/types";

export interface WhisperProgressItem {
  file: string;
  progress: number;
  total?: number;
}

export type WhisperWorkerMessage =
  | { status: "loading"; data: string }
  | ({ status: "initiate" } & WhisperProgressItem)
  | ({ status: "progress" } & WhisperProgressItem)
  | ({ status: "done" } & WhisperProgressItem)
  | { status: "ready" }
  | { status: "start" }
  | { status: "update"; output: string; tps?: number }
  | {
      status: "complete";
      output: string | string[];
      chunks?: Array<{ text: string; timestamp: [number, number] }>;
      audio_length?: number;
      streaming?: boolean;
    }
  | { status: "error"; data: string };

type WhisperWorkerEventHandler = (message: WhisperWorkerMessage) => void;

interface LocalWhisperWorker extends Worker {
  activeController?: AbortController;
  loaded?: boolean;
  streaming?: StreamingTranscription;
}

interface StreamingTranscription {
  controller: AbortController;
  session: TranscriptionSession;
  segments: Map<string, TranscriptSegment>;
  samplesWritten: number;
  writeChain: Promise<void>;
}

const dispatchWhisperMessage = (
  worker: LocalWhisperWorker,
  message: WhisperWorkerMessage,
): void => {
  worker.dispatchEvent(new MessageEvent("message", { data: message }));
};

const toWhisperProgressMessage = (event: LocalModelEvent): WhisperWorkerMessage | null => {
  if (event.type !== "model-progress") return null;
  const item = {
    file: event.file ?? "model",
    progress: event.progress ?? 0,
    ...(event.total !== undefined ? { total: event.total } : {}),
  };
  return event.progress !== undefined && event.progress >= 100
    ? { status: "done", ...item }
    : { status: "progress", ...item };
};

const createWhisperWorker = (): Worker => {
  const eventTarget = new EventTarget() as LocalWhisperWorker;
  eventTarget.terminate = () => {
    abortStreamingTranscription(eventTarget);
    eventTarget.activeController?.abort();
    eventTarget.activeController = undefined;
  };
  return eventTarget;
};

export const getOrCreateWhisperWorker = (workerRef: MutableRefObject<Worker | null>): Worker => {
  if (!workerRef.current) {
    workerRef.current = createWhisperWorker();
  }

  return workerRef.current;
};

export const subscribeToWhisperWorker = (
  worker: Worker,
  handler: WhisperWorkerEventHandler,
): (() => void) => {
  const handleMessage = (event: Event) => {
    handler((event as MessageEvent<WhisperWorkerMessage>).data);
  };

  worker.addEventListener("message", handleMessage);
  return () => {
    worker.removeEventListener("message", handleMessage);
  };
};

export const loadWhisperModel = (worker: Worker): void => {
  const localWorker = worker as LocalWhisperWorker;
  if (localWorker.loaded) {
    dispatchWhisperMessage(localWorker, { status: "ready" });
    return;
  }

  localWorker.activeController?.abort();
  const controller = new AbortController();
  localWorker.activeController = controller;

  void (async () => {
    dispatchWhisperMessage(localWorker, { status: "loading", data: "Loading model..." });
    try {
      for await (const event of localModelClient.transcribeAudio(
        {
          modelId: "whisper-base-timestamped",
          audio: new Float32Array(16_000),
          language: "en",
          returnTimestamps: "word",
        },
        { priority: "interactive", signal: controller.signal },
      )) {
        const progressMessage = toWhisperProgressMessage(event);
        if (progressMessage) {
          dispatchWhisperMessage(localWorker, progressMessage);
        }
      }
      localWorker.loaded = true;
      dispatchWhisperMessage(localWorker, { status: "ready" });
    } catch (error) {
      dispatchWhisperMessage(localWorker, {
        status: "error",
        data: error instanceof Error ? error.message : "Error loading model",
      });
    }
  })();
};

export const loadTranscriptionModel = (worker: Worker, runtime: TranscriptionRuntime): void => {
  const localWorker = worker as LocalWhisperWorker;
  abortStreamingTranscription(localWorker);
  localWorker.activeController?.abort();
  const controller = new AbortController();
  localWorker.activeController = controller;

  void (async () => {
    dispatchWhisperMessage(localWorker, { status: "loading", data: "Loading model..." });
    try {
      for await (const event of localModelClient.preloadModel(runtime.modelId, {
        priority: "interactive",
        signal: controller.signal,
      })) {
        const progressMessage = toWhisperProgressMessage(event);
        if (progressMessage) dispatchWhisperMessage(localWorker, progressMessage);
        if (event.type === "error") throw new Error(event.error.message);
      }
      controller.signal.throwIfAborted();
      localWorker.loaded = true;
      dispatchWhisperMessage(localWorker, { status: "ready" });
    } catch (error) {
      if (!controller.signal.aborted)
        dispatchWhisperMessage(localWorker, {
          status: "error",
          data: error instanceof Error ? error.message : "Error loading model",
        });
    }
  })();
};

const handleProviderEvent = (
  worker: LocalWhisperWorker,
  controller: AbortController,
  segments: Map<string, TranscriptSegment>,
  event: TranscriptionEvent,
): void => {
  if (controller.signal.aborted) return;
  if (event.type === "progress") {
    dispatchWhisperMessage(worker, {
      status: event.progress !== undefined && event.progress >= 100 ? "done" : "progress",
      file: event.label,
      progress: event.progress ?? 0,
    });
    return;
  }
  if (event.type === "segment") {
    segments.set(event.segment.id, event.segment);
    dispatchWhisperMessage(worker, {
      status: "update",
      output: [...segments.values()].map((segment) => segment.text.trim()).join(" "),
    });
    return;
  }
  if (event.type === "error") {
    dispatchWhisperMessage(worker, { status: "error", data: event.message });
  }
};

/** Starts one provider session that receives every PCM frame for the recording. */
export const startStreamingTranscription = async (
  worker: Worker,
  runtime: TranscriptionRuntime,
  language: string,
): Promise<void> => {
  const localWorker = worker as LocalWhisperWorker;
  abortStreamingTranscription(localWorker);
  localWorker.activeController?.abort();
  const controller = new AbortController();
  localWorker.activeController = controller;
  const segments = new Map<string, TranscriptSegment>();
  let streaming: StreamingTranscription | undefined;
  const session = await runtime.provider.open(
    {
      modelId: runtime.modelId,
      sampleRate: 16000,
      language,
      segmentation: "manual",
      timestamps: runtime.timestamps,
      signal: controller.signal,
    },
    (event) => {
      if (streaming) handleProviderEvent(localWorker, streaming.controller, streaming.segments, event);
    },
  );
  if (controller.signal.aborted) {
    session.abort();
    return;
  }
  streaming = {
    controller,
    session,
    segments,
    samplesWritten: 0,
    writeChain: Promise.resolve(),
  };
  localWorker.streaming = streaming;
  dispatchWhisperMessage(localWorker, { status: "start" });
};

export const writeStreamingTranscription = (worker: Worker, audio: Float32Array): Promise<void> => {
  const localWorker = worker as LocalWhisperWorker;
  const streaming = localWorker.streaming;
  if (!streaming) return Promise.reject(new Error("No active streaming transcription session."));
  streaming.samplesWritten += audio.length;
  streaming.writeChain = streaming.writeChain.then(() => streaming.session.write(audio));
  return streaming.writeChain;
};

export const finishStreamingTranscription = async (worker: Worker): Promise<void> => {
  const localWorker = worker as LocalWhisperWorker;
  const streaming = localWorker.streaming;
  if (!streaming) return;
  try {
    await streaming.writeChain;
    await streaming.session.finish();
    streaming.controller.signal.throwIfAborted();
    const transcript = toRecordingTranscript([...streaming.segments.values()]);
    localWorker.loaded = true;
    dispatchWhisperMessage(localWorker, {
      status: "complete",
      output: transcript.text,
      chunks: transcript.words,
      audio_length: streaming.samplesWritten,
      streaming: true,
    });
  } catch (error) {
    if (!streaming.controller.signal.aborted)
      dispatchWhisperMessage(localWorker, {
        status: "error",
        data: error instanceof Error ? error.message : "Streaming transcription failed",
      });
  } finally {
    streaming.session.abort();
    if (localWorker.streaming === streaming) localWorker.streaming = undefined;
    if (localWorker.activeController === streaming.controller) {
      localWorker.activeController = undefined;
    }
  }
};

export const abortStreamingTranscription = (worker: Worker): void => {
  const localWorker = worker as LocalWhisperWorker;
  const streaming = localWorker.streaming;
  if (!streaming) return;
  localWorker.streaming = undefined;
  streaming.controller.abort();
  streaming.session.abort();
  if (localWorker.activeController === streaming.controller) {
    localWorker.activeController = undefined;
  }
};

const defaultWhisperRuntime: TranscriptionRuntime = {
  provider: createWhisperTranscriptionProvider(),
  modelId: "whisper-base-timestamped",
  timestamps: "word",
};

export const generateWhisperTranscript = (
  worker: Worker,
  input: { audio: Float32Array; language: string },
): void => generateTranscription(worker, input, defaultWhisperRuntime);

export const generateTranscription = (
  worker: Worker,
  input: { audio: Float32Array; language: string },
  runtime: TranscriptionRuntime,
): void => {
  const localWorker = worker as LocalWhisperWorker;
  localWorker.activeController?.abort();
  const controller = new AbortController();
  localWorker.activeController = controller;

  void (async () => {
    dispatchWhisperMessage(localWorker, { status: "start" });
    const segments = new Map<string, TranscriptSegment>();
    let session: TranscriptionSession | undefined;
    try {
      session = await runtime.provider.open(
        {
          modelId: runtime.modelId,
          sampleRate: 16000,
          language: input.language,
          segmentation: "manual",
          timestamps: runtime.timestamps,
          signal: controller.signal,
        },
        (event) => handleProviderEvent(localWorker, controller, segments, event),
      );
      await session.write(input.audio);
      await session.finish();
      controller.signal.throwIfAborted();
      const transcript = toRecordingTranscript([...segments.values()]);
      localWorker.loaded = true;
      dispatchWhisperMessage(localWorker, {
        status: "complete",
        output: transcript.text,
        chunks: transcript.words,
        audio_length: input.audio.length,
      });
    } catch (error) {
      if (!controller.signal.aborted)
        dispatchWhisperMessage(localWorker, {
          status: "error",
          data: error instanceof Error ? error.message : "Transcription failed",
        });
    } finally {
      session?.abort();
    }
  })();
};
