import type { MutableRefObject } from "react";

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

const createWhisperWorker = (): Worker => {
  return new Worker(new URL("../../../workers/whisper.worker.ts", import.meta.url), {
    type: "module",
  });
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
  const handleMessage = (event: MessageEvent<WhisperWorkerMessage>) => {
    handler(event.data);
  };

  worker.addEventListener("message", handleMessage);
  return () => {
    worker.removeEventListener("message", handleMessage);
  };
};

export const loadWhisperModel = (worker: Worker): void => {
  worker.postMessage({ type: "load" });
};

export const generateWhisperTranscript = (
  worker: Worker,
  input: {
    audio: Float32Array;
    language: string;
  },
): void => {
  worker.postMessage({
    type: "generate",
    data: input,
  });
};
