import {
  getLocalModelManifest,
  type LocalAsrEvent,
  type LocalAsrRequest,
  type LocalChatEvent,
  type LocalChatRequest,
  type LocalModelPriority,
} from "@memora/local-model-runtime";

import { modelWorkerFactory, type ModelWorkerFactory } from "../model-worker";

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
}

const modelNotFoundEvents = async function* (modelId: string): AsyncGenerator<LocalChatEvent> {
  yield {
    type: "error",
    error: {
      code: "model-not-found",
      message: `Local model ${modelId} was not found.`,
    },
  };
  yield { type: "status", status: "failed" };
};

export const createLocalModelClient = (
  workerFactory: ModelWorkerFactory = modelWorkerFactory,
): LocalModelClient => {
  return {
    transcribeAudio(request, options = {}) {
      return workerFactory.run("asr", {
        priority: options.priority ?? "interactive",
        task: { kind: "asr.transcribe", input: request },
        signal: options.signal,
      }) as AsyncGenerator<LocalAsrEvent>;
    },
    streamChat(request, options = {}) {
      return workerFactory.run("chat", {
        priority: options.priority ?? "interactive",
        task: { kind: "chat.generate", input: request },
        signal: options.signal,
      }) as AsyncGenerator<LocalChatEvent>;
    },
    preloadModel(modelId, options = {}) {
      const manifest = getLocalModelManifest(modelId);
      if (!manifest) return modelNotFoundEvents(modelId);

      const pool = manifest.pool;
      console.warn("[local-model-client] preload", { modelId, pool });
      return workerFactory.run(pool, {
        priority: options.priority ?? "background",
        task: { kind: "model.preload", input: { modelId } },
        signal: options.signal,
      }) as AsyncGenerator<LocalChatEvent>;
    },
  };
};

export const localModelClient = createLocalModelClient();
