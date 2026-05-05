import {
  AutoProcessor,
  Qwen3_5ForConditionalGeneration,
  RawImage,
  type ProgressCallback,
} from "@huggingface/transformers";
import type {
  LocalChatEvent,
  LocalChatRequest,
  LocalModelManifest,
  LocalReasoningMode,
} from "@memora/local-model-runtime";

import { clearTransformersModelCache, isTransformersExternalDataCacheError } from "../cache";
import { reportWorkerRuntimeLoaded } from "../debug";
import { runTextGeneration } from "./generation";
import { localImageContentToRawImage } from "./media";
import {
  parseChatTemplateToolCall,
  parseJsonToolCall,
  parseXmlToolCall,
  type ParsedToolCall,
} from "./toolParsing";

type TextGenerationProcessor = Parameters<typeof runTextGeneration>[0]["processor"];

export interface QwenChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: LocalChatRequest["messages"][number]["content"];
}

interface QwenRuntime {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  model: Awaited<ReturnType<typeof Qwen3_5ForConditionalGeneration.from_pretrained>>;
}

let runtimePromise: Promise<QwenRuntime> | null = null;
let warmupPromise: Promise<void> | null = null;
let runtimeReady = false;
let cacheRecoveryAttempted = false;

const DEFAULT_QWEN_MAX_NEW_TOKENS = 2048;
const DEFAULT_QWEN_THINKING_MAX_NEW_TOKENS = 3072;

export const buildQwenMessages = (
  request: Pick<LocalChatRequest, "systemPrompt" | "messages" | "tools">,
): QwenChatMessage[] => {
  const messages: QwenChatMessage[] = [];
  const systemSections = [request.systemPrompt.trim()].filter((section) => section.length > 0);
  
  if (systemSections.length > 0) {
    messages.push({
      role: "system",
      content: [{ type: "text", text: systemSections.join("\n\n") }],
    });
  }

  messages.push(
    ...request.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  );
  return messages;
};

export const buildQwenGenerationConfig = (input: {
  reasoningMode?: LocalReasoningMode;
  hasImage?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Record<string, unknown> => {
  const thinking = input.reasoningMode === "thinking";
  const hasImage = input.hasImage ?? false;
  const defaults = thinking
    ? hasImage
      ? { temperature: 0.6, top_p: 0.95, presence_penalty: 0 }
      : { temperature: 1, top_p: 0.95, presence_penalty: 1.5 }
    : hasImage
      ? { temperature: 0.7, top_p: 0.8, top_k: 20, presence_penalty: 1.5 }
      : { temperature: 1, top_p: 1, top_k: 20, presence_penalty: 2 };

  return {
    ...defaults,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    max_new_tokens:
      input.maxTokens ??
      (thinking ? DEFAULT_QWEN_THINKING_MAX_NEW_TOKENS : DEFAULT_QWEN_MAX_NEW_TOKENS),
  };
};

export const parseQwenToolCall = (text: string): ParsedToolCall | null => {
  return parseChatTemplateToolCall(text) ?? parseXmlToolCall(text) ?? parseJsonToolCall(text);
};

export const runQwen35Chat = async (
  input: {
    manifest: LocalModelManifest;
    request: LocalChatRequest;
    canceled: () => boolean;
  },
  emit: (event: LocalChatEvent) => void,
): Promise<void> => {
  if (!runtimeReady) {
    emit({ type: "status", status: "loading-model" });
  }
  const runtime = await getQwenRuntime(input.manifest, (progress) => {
    emitProgress(progress, emit);
  });
  if (input.canceled()) return;
  await warmQwenRuntime(runtime);
  if (input.canceled()) return;

  const messages = await prepareQwenTemplateMessages(buildQwenMessages(input.request));
  const hasImage = input.request.messages.some((message) =>
    message.content.some((content) => content.type === "image"),
  );
  emit({ type: "status", status: "running" });
  const generation = await runTextGeneration({
    processor: runtime.processor as unknown as TextGenerationProcessor,
    model: runtime.model,
    messages,
    generationConfig: buildQwenGenerationConfig({
      reasoningMode: input.request.reasoningMode,
      hasImage,
      temperature: input.request.temperature,
      maxTokens: input.request.maxTokens,
    }),
    tools: input.request.tools,
    toolStreamingMode: input.request.tools.length > 0 ? "json" : "none",
    suppressTextDeltas: input.request.tools.length > 0,
    emit,
    canceled: input.canceled,
  });

  if (input.canceled()) return;

  if (input.request.tools.length > 0 && !generation.streamedVisibleText) {
    emitToolCallOrText(generation.text, parseQwenToolCall, emit);
  }
};

const getQwenRuntime = async (
  manifest: LocalModelManifest,
  progressCallback: ProgressCallback,
): Promise<QwenRuntime> => {
  runtimePromise ??= loadQwenRuntime(manifest, progressCallback).catch(async (error: unknown) => {
    runtimePromise = null;
    runtimeReady = false;

    if (!cacheRecoveryAttempted && isTransformersExternalDataCacheError(error)) {
      cacheRecoveryAttempted = true;
      await clearTransformersModelCache(manifest);
      runtimePromise = loadQwenRuntime(manifest, progressCallback);
      return runtimePromise;
    }

    throw error;
  });

  return runtimePromise;
};

const loadQwenRuntime = async (
  manifest: LocalModelManifest,
  progressCallback: ProgressCallback,
): Promise<QwenRuntime> => {
  return Promise.all([
    AutoProcessor.from_pretrained(manifest.modelId, { progress_callback: progressCallback }),
    Qwen3_5ForConditionalGeneration.from_pretrained(manifest.modelId, {
      progress_callback: progressCallback,
      dtype: manifest.dtype as never,
      device: manifest.device,
    }),
  ]).then(([processor, model]) => {
    runtimeReady = true;
    reportWorkerRuntimeLoaded({
      family: manifest.family,
      modelId: manifest.modelId,
      adapter: manifest.chat?.adapter ?? "qwen3.5",
      runtime: manifest.runtime,
    });
    return { processor, model };
  });
};

export const preloadQwen35Chat = async (
  manifest: LocalModelManifest,
  emit: (event: LocalChatEvent) => void,
): Promise<void> => {
  emit({ type: "status", status: "loading-model" });
  const runtime = await getQwenRuntime(manifest, (progress) => {
    emitProgress(progress, emit);
  });
  await warmQwenRuntime(runtime);
  emit({ type: "status", status: "completed" });
};

const warmQwenRuntime = async (runtime: QwenRuntime): Promise<void> => {
  warmupPromise ??= (async () => {
    const generatedText = await runTextGeneration({
      processor: runtime.processor as unknown as TextGenerationProcessor,
      model: runtime.model,
      messages: [{ role: "user", content: [{ type: "text", text: "ping" }] }],
      generationConfig: { max_new_tokens: 1, do_sample: false },
      suppressTextDeltas: true,
      emit: () => {},
      canceled: () => false,
    });
    void generatedText;
  })();

  return warmupPromise;
};

const prepareQwenTemplateMessages = async (messages: QwenChatMessage[]): Promise<unknown[]> => {
  return Promise.all(
    messages.map(async (message) => ({
      role: message.role,
      content: await Promise.all(
        message.content.map(async (content) => {
          if (content.type === "image") {
            const image = await localImageContentToRawImage(content);
            return { type: "image", image: image as RawImage };
          }
          if (content.type === "text") return content;
          if (content.type === "tool_result") {
            return { type: "text", text: JSON.stringify(content.result) };
          }
          if (content.type === "tool_call") {
            return {
              type: "text",
              text: JSON.stringify({ name: content.name, arguments: content.arguments }),
            };
          }
          return { type: "text", text: "" };
        }),
      ),
    })),
  );
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
