import {
  createAssistantMessageEventStream,
  createModels,
  createProvider,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type ProviderStreams,
  type SimpleStreamOptions,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import type { ModelStream as MemoraModelStream } from "@memora/ai-core";
import type {
  LocalChatContent,
  LocalChatEvent,
  LocalChatRequest,
  LocalModelManifest,
} from "@memora/local-model-runtime";

export interface ModelCatalogEntry {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
  samplingParams?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface PiModelRuntime {
  model: Model<Api>;
  stream: MemoraModelStream;
}

export interface RemotePiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  apiFormat: "chat-completions" | "responses";
  models: ModelCatalogEntry[];
  selectedModelId: string;
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

export interface LocalModelClientLike {
  streamChat: (
    request: LocalChatRequest,
    options?: { priority?: "interactive" | "background"; signal?: AbortSignal },
  ) => AsyncGenerator<LocalChatEvent>;
}

const LOCAL_PROVIDER_ID = "memora-local";
const LOCAL_API = "memora-local-worker";
const LOCAL_BASE_URL = "memora://local-worker";

const toRemoteModel = (
  model: ModelCatalogEntry,
  provider: Pick<RemotePiProviderConfig, "id" | "baseUrl" | "apiFormat">,
): Model<Api> => {
  const api = provider.apiFormat === "responses" ? "openai-responses" : "openai-completions";
  return {
    ...model,
    api,
    provider: provider.id,
    baseUrl: provider.baseUrl,
  } as Model<Api>;
};

const createKeylessAuth = (name: string) => ({
  apiKey: {
    name,
    resolve: async () => ({ auth: {} }),
  },
});

export const createRemotePiRuntime = (config: RemotePiProviderConfig): PiModelRuntime => {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Missing provider base URL.");
  }

  const models = config.models.map((model) => toRemoteModel(model, { ...config, baseUrl }));
  const selectedModel = models.find((model) => model.id === config.selectedModelId);
  if (!selectedModel) {
    throw new Error(`Model "${config.selectedModelId}" is not registered for ${config.name}.`);
  }

  const api: ProviderStreams =
    config.apiFormat === "responses" ? openAIResponsesApi() : openAICompletionsApi();
  const collection = createModels();
  collection.setProvider(
    createProvider({
      id: config.id,
      name: config.name,
      baseUrl,
      auth: createKeylessAuth(`${config.name} API key`),
      models,
      api,
    }),
  );

  const stream: MemoraModelStream = (model, context, options) => {
    const result = collection.streamSimple(model, context, {
      ...options,
      ...(config.apiKey?.trim() ? { apiKey: config.apiKey.trim() } : {}),
    });
    if (config.onUsage) {
      void result.result().then(
        (message) => {
          if (message.stopReason === "aborted" || message.stopReason === "error") return;
          const inputTokens = message.usage.input;
          const outputTokens = message.usage.output;
          if (
            !Number.isSafeInteger(inputTokens) ||
            inputTokens < 0 ||
            !Number.isSafeInteger(outputTokens) ||
            outputTokens < 0
          )
            return;
          try {
            config.onUsage?.({ inputTokens, outputTokens });
          } catch {
            console.warn("Could not save model token usage.");
          }
        },
        () => undefined,
      );
    }
    return result;
  };

  return { model: selectedModel, stream };
};

const zeroUsage = (): AssistantMessage["usage"] => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
});

const toLocalContent = (content: Context["messages"][number]): LocalChatContent[] => {
  if (content.role === "user") {
    if (typeof content.content === "string") {
      return [{ type: "text", text: content.content }];
    }
    return content.content.map((item) => {
      if (item.type === "image") {
        return { type: "image" as const, mimeType: item.mimeType, data: item.data };
      }
      return { type: "text" as const, text: item.text };
    });
  }

  if (content.role === "assistant") {
    const result: LocalChatContent[] = [];
    for (const item of content.content) {
      if (item.type === "text") {
        result.push({ type: "text", text: item.text });
      }
      if (item.type === "toolCall") {
        result.push({
          type: "tool_call",
          id: item.id,
          name: item.name,
          arguments: item.arguments,
        });
      }
    }
    return result;
  }

  if (content.role === "toolResult") {
    return [
      {
        type: "tool_result",
        id: content.toolCallId,
        name: content.toolName,
        result: content.content
          .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
          .map((item) => item.text)
          .join(""),
        isError: content.isError,
      },
    ];
  }

  return [];
};

const toLocalRequest = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): LocalChatRequest => {
  return {
    modelId: model.id,
    systemPrompt: context.systemPrompt ?? "",
    messages: context.messages.map((message) => ({
      role: message.role === "toolResult" ? "tool" : message.role,
      content: toLocalContent(message),
      ...(message.role === "assistant"
        ? {
            reasoning: message.content
              .filter((content) => content.type === "thinking")
              .map((content) => content.thinking)
              .join(""),
          }
        : {}),
    })),
    tools: (context.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    })),
    ...(options?.reasoning ? { reasoningMode: "thinking" as const } : {}),
    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    maxTokens: options?.maxTokens ?? model.maxTokens,
  };
};

const createLocalModel = (manifest: LocalModelManifest): Model<typeof LOCAL_API> => {
  if (!manifest.chat || manifest.task !== "chat") {
    throw new Error(`Local model ${manifest.id} is not chat-capable.`);
  }

  return {
    id: manifest.id,
    name: manifest.displayName,
    api: LOCAL_API,
    provider: LOCAL_PROVIDER_ID,
    baseUrl: LOCAL_BASE_URL,
    reasoning: manifest.chat.supportsReasoning,
    ...(manifest.chat.supportsReasoning
      ? {
          thinkingLevelMap: {
            minimal: null,
            low: null,
            medium: null,
            high: "thinking",
            xhigh: null,
            max: null,
          },
        }
      : {}),
    input: manifest.modalities.input.filter(
      (input): input is "text" | "image" => input === "text" || input === "image",
    ),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: manifest.limits?.contextWindow ?? 32768,
    maxTokens:
      manifest.limits?.maxOutputTokens ?? manifest.chat.generationDefaults?.maxTokens ?? 512,
  };
};

const createLocalStreams = (client: LocalModelClientLike): ProviderStreams => {
  const streamSimple = (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => {
    const eventStream = createAssistantMessageEventStream();

    void (async () => {
      const output: AssistantMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: zeroUsage(),
        stopReason: "pending",
        timestamp: Date.now(),
      };
      let textIndex = -1;
      let thinkingIndex = -1;
      let thinkingEnded = false;
      const toolIndexes = new Map<string, number>();

      try {
        eventStream.push({ type: "start", partial: output });
        for await (const event of client.streamChat(toLocalRequest(model, context, options), {
          priority: "interactive",
          signal: options?.signal,
        })) {
          switch (event.type) {
            case "text-delta":
              if (textIndex < 0) {
                textIndex = output.content.length;
                output.content.push({ type: "text", text: "" });
                eventStream.push({ type: "text_start", contentIndex: textIndex, partial: output });
              }
              (
                output.content[textIndex] as Extract<
                  AssistantMessage["content"][number],
                  { type: "text" }
                >
              ).text += event.delta;
              eventStream.push({
                type: "text_delta",
                contentIndex: textIndex,
                delta: event.delta,
                partial: output,
              });
              break;
            case "reasoning-delta":
              if (thinkingIndex < 0) {
                thinkingIndex = output.content.length;
                output.content.push({ type: "thinking", thinking: "" });
                eventStream.push({
                  type: "thinking_start",
                  contentIndex: thinkingIndex,
                  partial: output,
                });
              }
              (
                output.content[thinkingIndex] as Extract<
                  AssistantMessage["content"][number],
                  { type: "thinking" }
                >
              ).thinking += event.delta;
              eventStream.push({
                type: "thinking_delta",
                contentIndex: thinkingIndex,
                delta: event.delta,
                partial: output,
              });
              break;
            case "reasoning-done":
              if (thinkingIndex >= 0) {
                (
                  output.content[thinkingIndex] as Extract<
                    AssistantMessage["content"][number],
                    { type: "thinking" }
                  >
                ).thinking = event.text;
                eventStream.push({
                  type: "thinking_end",
                  contentIndex: thinkingIndex,
                  content: event.text,
                  partial: output,
                });
                thinkingEnded = true;
              }
              break;
            case "tool-call-start": {
              const contentIndex = output.content.length;
              toolIndexes.set(event.toolCall.id, contentIndex);
              output.content.push({
                type: "toolCall",
                id: event.toolCall.id,
                name: event.toolCall.name,
                arguments: {},
              });
              eventStream.push({ type: "toolcall_start", contentIndex, partial: output });
              break;
            }
            case "tool-call-args-delta": {
              const contentIndex = toolIndexes.get(event.toolCallId);
              if (contentIndex !== undefined) {
                eventStream.push({
                  type: "toolcall_delta",
                  contentIndex,
                  delta: event.delta,
                  partial: output,
                });
              }
              break;
            }
            case "tool-call-complete": {
              const contentIndex = toolIndexes.get(event.toolCall.id);
              if (contentIndex === undefined) break;
              const toolCall = output.content[contentIndex];
              if (toolCall?.type === "toolCall") {
                toolCall.name = event.toolCall.name;
                toolCall.arguments = event.toolCall.arguments;
                eventStream.push({ type: "toolcall_end", contentIndex, toolCall, partial: output });
              }
              break;
            }
            case "usage":
              output.usage.input = event.inputTokens ?? output.usage.input;
              output.usage.output = event.outputTokens ?? output.usage.output;
              output.usage.totalTokens =
                event.totalTokens ?? output.usage.input + output.usage.output;
              break;
            case "error":
              throw new Error(event.error.message);
            default:
              break;
          }
        }

        if (textIndex >= 0) {
          const text = output.content[textIndex];
          if (text?.type === "text") {
            eventStream.push({
              type: "text_end",
              contentIndex: textIndex,
              content: text.text,
              partial: output,
            });
          }
        }
        if (thinkingIndex >= 0 && !thinkingEnded) {
          const thinking = output.content[thinkingIndex];
          if (thinking?.type === "thinking") {
            eventStream.push({
              type: "thinking_end",
              contentIndex: thinkingIndex,
              content: thinking.thinking,
              partial: output,
            });
          }
        }

        output.stopReason = toolIndexes.size > 0 ? "toolUse" : "stop";
        eventStream.push({ type: "done", reason: output.stopReason, message: output });
      } catch (error) {
        output.stopReason = options?.signal?.aborted ? "aborted" : "error";
        output.errorMessage = error instanceof Error ? error.message : String(error);
        eventStream.push({ type: "error", reason: output.stopReason, error: output });
      } finally {
        eventStream.end();
      }
    })();

    return eventStream;
  };

  return {
    stream: (model, context, options?: StreamOptions) => {
      return streamSimple(model, context, options);
    },
    streamSimple,
  };
};

export const createLocalPiRuntime = (input: {
  client: LocalModelClientLike;
  manifest: LocalModelManifest;
  priority?: "interactive" | "background";
}): PiModelRuntime => {
  const model = createLocalModel(input.manifest);
  const collection = createModels();
  collection.setProvider(
    createProvider({
      id: LOCAL_PROVIDER_ID,
      name: "Memora Local",
      baseUrl: LOCAL_BASE_URL,
      auth: createKeylessAuth("Memora Local"),
      models: [model],
      api: createLocalStreams({
        streamChat: (request, options) =>
          input.client.streamChat(request, {
            ...options,
            priority: input.priority ?? options?.priority,
          }),
      }),
    }),
  );

  return {
    model,
    stream: (nextModel, context, options) => collection.streamSimple(nextModel, context, options),
  };
};

export { LOCAL_API, LOCAL_PROVIDER_ID };
