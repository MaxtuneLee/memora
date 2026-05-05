import type {
  LocalChatEvent,
  LocalChatRequest,
  LocalModelPriority,
  LocalReasoningMode,
} from "@memora/local-model-runtime";

export interface LocalModelClientLike {
  streamChat: (
    request: LocalChatRequest,
    options?: { priority?: LocalModelPriority; signal?: AbortSignal },
  ) => AsyncGenerator<LocalChatEvent>;
}

export interface LocalProviderConfig {
  client: LocalModelClientLike;
  reasoningMode?: LocalReasoningMode;
  priority?: LocalModelPriority;
  debug?: boolean;
  logger?: Pick<Console, "info">;
}
