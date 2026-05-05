import type { ProviderAdapter, ProviderRequest } from "@memora/ai-core";

import { localChatEventToProviderEvent } from "./events";
import { providerRequestToLocalChatRequest } from "./transform";
import type { LocalProviderConfig } from "./types";

export { localChatEventToProviderEvent } from "./events";
export { providerRequestToLocalChatRequest } from "./transform";
export type { LocalModelClientLike, LocalProviderConfig } from "./types";

const logLocalChatRequest = (
  config: LocalProviderConfig,
  request: ReturnType<typeof providerRequestToLocalChatRequest>,
): void => {
  if (!config.debug) {
    return;
  }

  const logger = config.logger ?? console;
  logger.info("[local-model] chat request", {
    modelId: request.modelId,
    reasoningMode: request.reasoningMode,
    messageCount: request.messages.length,
    toolCount: request.tools.length,
    hasSystemPrompt: request.systemPrompt.trim().length > 0,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
  });
};

export const createLocalProvider = (config: LocalProviderConfig): ProviderAdapter => {
  return {
    async *stream(request: ProviderRequest, options?: { signal?: AbortSignal }) {
      const localRequest = providerRequestToLocalChatRequest(request, {
        reasoningMode: config.reasoningMode,
      });
      logLocalChatRequest(config, localRequest);

      for await (const event of config.client.streamChat(localRequest, {
        priority: config.priority ?? "interactive",
        signal: options?.signal,
      })) {
        const providerEvent = localChatEventToProviderEvent(event);
        if (providerEvent) {
          yield providerEvent;
        }
      }
    },
  };
};
