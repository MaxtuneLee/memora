import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  RawImage,
  InterruptableStoppingCriteria,
  TextStreamer,
  type ProgressCallback,
} from "@huggingface/transformers";
import type {
  LocalChatEvent,
  LocalChatRequest,
  LocalModelManifest,
  LocalReasoningMode,
} from "@memora/local-model-runtime";

import { localImageContentToRawImage } from "./media";
import { clearTransformersModelCache, isTransformersExternalDataCacheError } from "../cache";
import { reportWorkerRuntimeLoaded } from "../debug";
import { parseChatTemplateToolCall, parseJsonToolCall, type ParsedToolCall } from "./toolParsing";
import { toChatTemplateTools } from "./generation";

export interface GemmaChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string | Array<{ type: "text"; text: string } | { type: "image"; image: RawImage }>;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  name?: string;
  tool_call_id?: string;
}

interface GemmaRuntime {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  model: Awaited<ReturnType<typeof Gemma4ForConditionalGeneration.from_pretrained>>;
}

interface GemmaProcessorLike {
  apply_chat_template: (messages: unknown, options?: Record<string, unknown>) => string;
  tokenizer: {
    all_special_ids: number[];
    decode: (tokens: bigint[] | bigint[][], options?: Record<string, unknown>) => string;
  };
  (
    text: string,
    image?: RawImage | null,
    audio?: unknown,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

interface GemmaStreamingState {
  mode: "unknown" | "content" | "tool";
  pendingVisibleText: string;
  emittedText: string;
}

let runtimePromise: Promise<GemmaRuntime> | null = null;
let warmupPromise: Promise<void> | null = null;
let runtimeReady = false;
let cacheRecoveryAttempted = false;

const GEMMA_STREAM_CONTROL_TOKENS =
  /<\|channel\|>|<channel\|>|<turn\|>|<eos>|<bos>|<\|channel>|<\|tool_response\|>|<\|tool_response>|<tool_response\|>/g;

export const buildGemmaMessages = async (
  request: Pick<LocalChatRequest, "systemPrompt" | "messages" | "tools">,
): Promise<GemmaChatMessage[]> => {
  const messages: GemmaChatMessage[] = [];
  if (request.systemPrompt.trim()) {
    messages.push({
      role: "system",
      content: request.systemPrompt.trim(),
    });
  }

  const historyMessages = await Promise.all(
    request.messages.map((message) => buildGemmaMessagesFromHistory(message.role, message.content)),
  );
  messages.push(...historyMessages.flat());
  return messages;
};

export const buildGemmaGenerationConfig = (input: {
  reasoningMode?: LocalReasoningMode;
  temperature?: number;
  maxTokens?: number;
}): Record<string, unknown> => {
  return {
    temperature: input.temperature ?? 1,
    top_p: 0.95,
    top_k: 64,
    max_new_tokens: input.maxTokens ?? 512,
    ...(input.reasoningMode === "thinking" ? { reasoningPrompt: "<|think|>" } : {}),
  };
};

export const parseGemmaToolCall = (text: string): ParsedToolCall | null => {
  return parseChatTemplateToolCall(text) ?? parseJsonToolCall(text);
};

export const runGemma4Chat = async (
  input: {
    manifest: LocalModelManifest;
    request: LocalChatRequest;
    canceled: () => boolean;
  },
  emit: (event: LocalChatEvent) => void,
): Promise<void> => {
  const hasAudio = input.request.messages.some((message) =>
    message.content.some((content) => content.type === "audio"),
  );
  if (hasAudio) {
    emit({
      type: "error",
      error: {
        code: "unsupported-modality",
        message:
          "Gemma audio chat input is declared by the model but not wired to decoded audio yet.",
      },
    });
    return;
  }

  if (!runtimeReady) {
    emit({ type: "status", status: "loading-model" });
  }
  const runtime = await getGemmaRuntime(input.manifest, (progress) => {
    emitProgress(progress, emit);
  });
  if (input.canceled()) return;
  await warmGemmaRuntime(runtime);
  if (input.canceled()) return;

  const messages = await buildGemmaMessages(input.request);
  emit({ type: "status", status: "running" });
  const generation = await runGemmaTextGeneration({
    processor: runtime.processor as GemmaProcessorLike,
    model: runtime.model,
    messages,
    reasoningMode: input.request.reasoningMode,
    generationConfig: buildGemmaGenerationConfig({
      reasoningMode: input.request.reasoningMode,
      temperature: input.request.temperature,
      maxTokens: input.request.maxTokens,
    }),
    tools: input.request.tools,
    toolStreamingMode: input.request.tools.length > 0 ? "native-markup" : "none",
    emit,
    canceled: input.canceled,
  });

  if (input.canceled()) return;

  if (input.request.tools.length > 0 && !generation.streamedVisibleText) {
    emitToolCallOrText(generation.text, parseGemmaToolCall, emit);
  }
};

const getGemmaRuntime = async (
  manifest: LocalModelManifest,
  progressCallback: ProgressCallback,
): Promise<GemmaRuntime> => {
  runtimePromise ??= loadGemmaRuntime(manifest, progressCallback).catch(async (error: unknown) => {
    runtimePromise = null;
    runtimeReady = false;

    if (!cacheRecoveryAttempted && isTransformersExternalDataCacheError(error)) {
      cacheRecoveryAttempted = true;
      await clearTransformersModelCache(manifest);
      runtimePromise = loadGemmaRuntime(manifest, progressCallback);
      return runtimePromise;
    }

    throw error;
  });

  return runtimePromise;
};

const loadGemmaRuntime = async (
  manifest: LocalModelManifest,
  progressCallback: ProgressCallback,
): Promise<GemmaRuntime> => {
  return Promise.all([
    AutoProcessor.from_pretrained(manifest.modelId, { progress_callback: progressCallback }),
    Gemma4ForConditionalGeneration.from_pretrained(manifest.modelId, {
      progress_callback: progressCallback,
      dtype: manifest.dtype as never,
      device: manifest.device,
    }),
  ]).then(([processor, model]) => {
    runtimeReady = true;
    reportWorkerRuntimeLoaded({
      family: manifest.family,
      modelId: manifest.modelId,
      adapter: manifest.chat?.adapter ?? "gemma4",
      runtime: manifest.runtime,
    });
    return { processor, model };
  });
};

export const preloadGemma4Chat = async (
  manifest: LocalModelManifest,
  emit: (event: LocalChatEvent) => void,
): Promise<void> => {
  emit({ type: "status", status: "loading-model" });
  const runtime = await getGemmaRuntime(manifest, (progress) => {
    emitProgress(progress, emit);
  });
  await warmGemmaRuntime(runtime);
  emit({ type: "status", status: "completed" });
};

const runGemmaTextGeneration = async (input: {
  processor: GemmaProcessorLike;
  model: GemmaRuntime["model"];
  messages: unknown[];
  reasoningMode?: LocalReasoningMode;
  generationConfig: Record<string, unknown>;
  tools?: unknown[];
  toolStreamingMode?: "none" | "native-markup";
  emit: (event: LocalChatEvent) => void;
  canceled: () => boolean;
}): Promise<{ text: string; streamedVisibleText: boolean }> => {
  const prompt = buildGemmaPrompt(input.processor, input.messages, {
    reasoningMode: input.reasoningMode,
    tools: input.tools,
  });

  const firstImage = extractFirstGemmaImage(input.messages);
  const modelInputs = await input.processor(prompt, firstImage, null, {
    add_special_tokens: false,
  });

  let generatedText = "";
  let rawBuffer = "";
  const streamingState: GemmaStreamingState = {
    mode: input.toolStreamingMode === "none" ? "content" : "unknown",
    pendingVisibleText: "",
    emittedText: "",
  };
  const stoppingCriteria = new InterruptableStoppingCriteria();
  const streamer = new TextStreamer(input.processor.tokenizer as never, {
    skip_prompt: true,
    skip_special_tokens: false,
    callback_function: (chunk: string) => {
      if (!chunk || input.canceled()) {
        if (input.canceled()) stoppingCriteria.interrupt();
        return;
      }

      rawBuffer += chunk;
      const visibleChunk = chunk.replace(GEMMA_STREAM_CONTROL_TOKENS, "");
      if (!visibleChunk) return;

      generatedText += visibleChunk;
      streamGemmaVisibleText({
        state: streamingState,
        delta: visibleChunk,
        rawBuffer,
        toolStreamingMode: input.toolStreamingMode ?? "none",
        emit: input.emit,
      });
    },
  });

  await input.model.generate({
    ...modelInputs,
    ...input.generationConfig,
    streamer,
    stopping_criteria: stoppingCriteria,
  });

  flushGemmaVisibleText(streamingState, input.emit);
  const trailing = rawBuffer.replace(GEMMA_STREAM_CONTROL_TOKENS, "");
  const text = trailing.length >= generatedText.length ? trailing : generatedText;
  return {
    text,
    streamedVisibleText: streamingState.emittedText.length > 0,
  };
};

const streamGemmaVisibleText = (input: {
  state: GemmaStreamingState;
  delta: string;
  rawBuffer: string;
  toolStreamingMode: "none" | "native-markup";
  emit: (event: LocalChatEvent) => void;
}): void => {
  if (!input.delta) return;

  if (input.state.mode === "content") {
    input.state.emittedText += input.delta;
    input.emit({ type: "text-delta", delta: input.delta });
    return;
  }

  if (input.state.mode === "tool") {
    return;
  }

  input.state.pendingVisibleText += input.delta;
  const nextMode = decideGemmaStreamingMode(input.toolStreamingMode, input.rawBuffer);
  if (nextMode === "unknown") {
    return;
  }

  input.state.mode = nextMode;
  if (nextMode !== "content" || !input.state.pendingVisibleText) {
    input.state.pendingVisibleText = "";
    return;
  }

  input.state.emittedText += input.state.pendingVisibleText;
  input.emit({ type: "text-delta", delta: input.state.pendingVisibleText });
  input.state.pendingVisibleText = "";
};

const flushGemmaVisibleText = (
  state: GemmaStreamingState,
  emit: (event: LocalChatEvent) => void,
): void => {
  if (!state.pendingVisibleText) return;
  if (state.mode === "tool") {
    state.pendingVisibleText = "";
    return;
  }

  state.mode = "content";
  state.emittedText += state.pendingVisibleText;
  emit({ type: "text-delta", delta: state.pendingVisibleText });
  state.pendingVisibleText = "";
};

const decideGemmaStreamingMode = (
  toolStreamingMode: "none" | "native-markup",
  rawBuffer: string,
): GemmaStreamingState["mode"] => {
  if (toolStreamingMode === "none") {
    return "content";
  }

  const trimmed = rawBuffer.trimStart();
  if (!trimmed) {
    return "unknown";
  }

  if (
    trimmed.startsWith("<|tool_call>") ||
    trimmed.startsWith("<tool_call|>") ||
    trimmed.startsWith("<|tool_response>") ||
    trimmed.startsWith("<tool_response|>")
  ) {
    return "tool";
  }

  return "content";
};

const warmGemmaRuntime = async (runtime: GemmaRuntime): Promise<void> => {
  warmupPromise ??= (async () => {
    const templateOptions: Record<string, unknown> = {
      enable_thinking: false,
      add_generation_prompt: true,
    };
    const prompt = runtime.processor.apply_chat_template(
      [{ role: "user", content: "ping" }],
      templateOptions,
    );
    if (typeof prompt !== "string") {
      throw new Error("Gemma chat template did not return a prompt string.");
    }
    const modelInputs = await (runtime.processor as GemmaProcessorLike)(prompt, null, null, {
      add_special_tokens: false,
    });
    await runtime.model.generate({
      ...modelInputs,
      max_new_tokens: 1,
      do_sample: false,
    });
  })();

  return warmupPromise;
};

const buildGemmaPrompt = (
  processor: GemmaProcessorLike,
  messages: unknown[],
  options: {
    reasoningMode?: LocalReasoningMode;
    tools?: unknown[];
  } = {},
): string => {
  const templateTools = toChatTemplateTools(options.tools ?? []);
  const templateOptions = {
    enable_thinking: options.reasoningMode === "thinking",
    add_generation_prompt: true,
    ...(templateTools.length > 0 ? { tools: templateTools } : {}),
  };

  try {
    return processor.apply_chat_template(messages, templateOptions);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unknown ArrayValue filter: trim")) {
      throw error;
    }

    console.info("[local-model][gemma4] trim-fallback messages", messages);

    return processor.apply_chat_template(normalizeGemmaMessagesToText(messages), templateOptions);
  }
};

const normalizeGemmaMessagesToText = (messages: unknown[]): unknown[] => {
  return messages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return message;

    const record = message as { content?: unknown };
    if (!Array.isArray(record.content)) return message;

    return {
      ...(message as Record<string, unknown>),
      content: record.content.map(gemmaContentItemToText).filter(Boolean).join("\n"),
    };
  });
};

const buildGemmaMessagesFromHistory = async (
  role: LocalChatRequest["messages"][number]["role"],
  content: LocalChatRequest["messages"][number]["content"],
): Promise<GemmaChatMessage[]> => {
  const textParts = content
    .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .filter(Boolean);
  const imageParts = content.filter(
    (item): item is Extract<typeof item, { type: "image" }> => item.type === "image",
  );
  const toolCalls = content.filter(
    (item): item is Extract<typeof item, { type: "tool_call" }> => item.type === "tool_call",
  );
  const toolResults = content.filter(
    (item): item is Extract<typeof item, { type: "tool_result" }> => item.type === "tool_result",
  );

  if (toolResults.length > 0) {
    return toolResults.map((item) => ({
      role: "tool",
      name: item.name,
      tool_call_id: item.id,
      content: typeof item.result === "string" ? item.result : JSON.stringify(item.result),
    }));
  }

  if (toolCalls.length > 0) {
    return [
      {
        role,
        ...(textParts.length > 0 ? { content: textParts.join("\n") } : {}),
        tool_calls: toolCalls.map((item) => ({
          id: item.id,
          function: {
            name: item.name,
            arguments: item.arguments,
          },
        })),
      },
    ];
  }

  if (imageParts.length > 0) {
    return [
      {
        role,
        content: [
          ...(await Promise.all(
            imageParts.map(async (item) => ({
              type: "image" as const,
              image: await localImageContentToRawImage(item),
            })),
          )),
          ...(textParts.length > 0 ? [{ type: "text" as const, text: textParts.join("\n") }] : []),
        ],
      },
    ];
  }

  return [
    {
      role,
      content: textParts.join("\n"),
    },
  ];
};

const gemmaContentItemToText = (content: unknown): string => {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";

  const record = content as Record<string, unknown>;
  if (record.type === "text" && typeof record.text === "string") return record.text;
  if (record.type === "tool_result") return JSON.stringify(record.result);
  if (record.type === "tool_call") {
    return JSON.stringify({ name: record.name, arguments: record.arguments });
  }
  if (record.type === "image") return "[Image]";
  if (record.type === "audio") return "[Audio]";
  return "";
};

const extractFirstGemmaImage = (messages: unknown[]): RawImage | null => {
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const maybeImage = (item as { type?: unknown; image?: unknown }).type;
      if (maybeImage === "image") {
        return (item as { image: RawImage }).image;
      }
    }
  }
  return null;
};

const emitProgress = (progress: unknown, emit: (event: LocalChatEvent) => void): void => {
  if (!progress || typeof progress !== "object") return;
  const record = progress as Record<string, unknown>;
  emit({
    type: "model-progress",
    ...(typeof record.file === "string" ? { file: record.file } : {}),
    ...(typeof record.progress === "number" ? { progress: record.progress } : {}),
    ...(typeof record.total === "number" ? { total: record.total } : {}),
  });
};

const emitToolCallOrText = (
  generatedText: string,
  parser: (text: string) => ParsedToolCall | null,
  emit: (event: LocalChatEvent) => void,
): void => {
  const toolCall = parser(generatedText.trim());
  if (!toolCall) {
    if (generatedText) emit({ type: "text-delta", delta: generatedText });
    return;
  }

  const id = crypto.randomUUID();
  const args = JSON.stringify(toolCall.arguments);
  emit({ type: "tool-call-start", toolCall: { id, name: toolCall.name } });
  emit({ type: "tool-call-args-delta", toolCallId: id, delta: args });
  emit({
    type: "tool-call-complete",
    toolCall: { id, name: toolCall.name, arguments: toolCall.arguments },
  });
};

export const __private__ = {
  buildGemmaPrompt,
};
