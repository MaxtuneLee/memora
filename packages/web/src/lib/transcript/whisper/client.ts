import type { MutableRefObject } from "react";

import type { LocalAsrEvent } from "@memora/local-model-runtime";
import { localModelClient } from "@/lib/local-model";

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
    }
  | { status: "error"; data: string };

type WhisperWorkerEventHandler = (message: WhisperWorkerMessage) => void;

interface LocalWhisperWorker extends Worker {
  activeController?: AbortController;
  loaded?: boolean;
}

const dispatchWhisperMessage = (
  worker: LocalWhisperWorker,
  message: WhisperWorkerMessage,
): void => {
  worker.dispatchEvent(new MessageEvent("message", { data: message }));
};

const toWhisperProgressMessage = (event: LocalAsrEvent): WhisperWorkerMessage | null => {
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

export const generateWhisperTranscript = (
  worker: Worker,
  input: {
    audio: Float32Array;
    language: string;
  },
): void => {
  const localWorker = worker as LocalWhisperWorker;
  localWorker.activeController?.abort();
  const controller = new AbortController();
  localWorker.activeController = controller;

  void (async () => {
    dispatchWhisperMessage(localWorker, { status: "start" });
    try {
      for await (const event of localModelClient.transcribeAudio(
        {
          modelId: "whisper-base-timestamped",
          audio: input.audio,
          language: input.language,
          returnTimestamps: "word",
        },
        { priority: "interactive", signal: controller.signal },
      )) {
        const progressMessage = toWhisperProgressMessage(event);
        if (progressMessage) {
          dispatchWhisperMessage(localWorker, progressMessage);
          continue;
        }

        if (event.type === "transcript-delta") {
          dispatchWhisperMessage(localWorker, { status: "update", output: event.text });
          continue;
        }

        if (event.type === "transcript-complete") {
          localWorker.loaded = true;
          dispatchWhisperMessage(localWorker, {
            status: "complete",
            output: event.text,
            chunks: event.chunks,
            audio_length: event.audioLength,
          });
          continue;
        }

        if (event.type === "error") {
          dispatchWhisperMessage(localWorker, { status: "error", data: event.error.message });
        }
      }
    } catch (error) {
      dispatchWhisperMessage(localWorker, {
        status: "error",
        data: error instanceof Error ? error.message : "Transcription failed",
      });
    }
  })();
};
