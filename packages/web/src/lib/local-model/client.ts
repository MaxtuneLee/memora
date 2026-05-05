import type {
  LocalAsrEvent,
  LocalAsrRequest,
  LocalChatEvent,
  LocalChatRequest,
  LocalModelPriority,
} from "@memora/local-model-runtime";

import { createLocalModelWorker } from "./createWorker";
import { createLocalModelWorkerPool } from "./workerPool";

const createRequestId = (): string => crypto.randomUUID();

export interface LocalModelClient {
  transcribeAudio: (
    request: LocalAsrRequest,
    options?: { priority?: LocalModelPriority; signal?: AbortSignal },
  ) => AsyncGenerator<LocalAsrEvent>;
  streamChat: (
    request: LocalChatRequest,
    options?: { priority?: LocalModelPriority; signal?: AbortSignal },
  ) => AsyncGenerator<LocalChatEvent>;
  preloadModel: (
    modelId: string,
    options?: { priority?: LocalModelPriority; signal?: AbortSignal },
  ) => AsyncGenerator<LocalChatEvent>;
  terminate: () => void;
}

export const createLocalModelClient = (): LocalModelClient => {
  const asrPool = createLocalModelWorkerPool({ pool: "asr", createWorker: createLocalModelWorker });
  const chatPool = createLocalModelWorkerPool({
    pool: "chat",
    createWorker: createLocalModelWorker,
  });

  return {
    transcribeAudio(request, options = {}) {
      return asrPool.run({
        requestId: createRequestId(),
        priority: options.priority ?? "interactive",
        task: { kind: "asr.transcribe", input: request },
        signal: options.signal,
      }) as AsyncGenerator<LocalAsrEvent>;
    },
    streamChat(request, options = {}) {
      return chatPool.run({
        requestId: createRequestId(),
        priority: options.priority ?? "interactive",
        task: { kind: "chat.generate", input: request },
        signal: options.signal,
      }) as AsyncGenerator<LocalChatEvent>;
    },
    preloadModel(modelId, options = {}) {
      return chatPool.run({
        requestId: createRequestId(),
        priority: options.priority ?? "background",
        task: { kind: "model.preload", input: { modelId } },
        signal: options.signal,
      }) as AsyncGenerator<LocalChatEvent>;
    },
    terminate() {
      asrPool.terminate();
      chatPool.terminate();
    },
  };
};

export const localModelClient = createLocalModelClient();
