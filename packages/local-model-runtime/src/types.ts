import type { AgentMessageContent } from "@memora/ai-core";

export type LocalModelPoolKey = "asr" | "chat" | "embedding";
export type LocalModelPriority = "interactive" | "background";
export type LocalModelTaskStatus =
  | "queued"
  | "assigned"
  | "loading-model"
  | "running"
  | "completed"
  | "failed"
  | "aborted";
export type LocalModelRuntime = "transformers-js";
export type LocalModelDevice = "webgpu" | "wasm";
export type LocalModelModality = "text" | "image" | "audio" | "video";
export type LocalModelOutputModality = "text" | "json" | "tool-call";
export type LocalReasoningMode = "non-thinking" | "thinking";

export type LocalModelErrorCode =
  | "webgpu-unavailable"
  | "model-not-found"
  | "unsupported-modality"
  | "unsupported-tools"
  | "unsupported-reasoning"
  | "model-load-failed"
  | "generation-failed"
  | "tool-call-parse-failed"
  | "worker-crashed"
  | "request-aborted"
  | "capacity-exceeded";

export interface LocalModelError {
  code: LocalModelErrorCode;
  message: string;
  detail?: string;
}

export interface LocalGenerationDefaults {
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  maxTokens?: number;
}

export interface LocalChatCapabilities {
  adapter: "qwen3.5" | "gemma4" | string;
  supportsSystemPrompt: boolean;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  reasoningModes: LocalReasoningMode[];
  defaultReasoningMode: LocalReasoningMode;
  supportsTools: boolean;
  toolCalling?: {
    mode: "native" | "template-json";
    streamingArgs: boolean;
    requiresToolResultTemplate: boolean;
  };
  generationDefaults?: LocalGenerationDefaults;
}

export interface LocalAsrCapabilities {
  adapter: "whisper" | string;
  supportsWordTimestamps: boolean;
}

export interface LocalModelTokenLimits {
  contextWindow: number;
}

export interface LocalModelManifest {
  id: string;
  displayName: string;
  downloadSizeGB?: number;
  family: "whisper" | "qwen" | "gemma" | string;
  task: "asr" | "chat" | "embedding";
  modelId: string;
  runtime: LocalModelRuntime;
  device: LocalModelDevice;
  pool: LocalModelPoolKey;
  modalities: {
    input: LocalModelModality[];
    output: LocalModelOutputModality[];
  };
  dtype?: unknown;
  limits?: LocalModelTokenLimits;
  chat?: LocalChatCapabilities;
  asr?: LocalAsrCapabilities;
}

export interface LocalToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type LocalChatContent =
  | AgentMessageContent
  | { type: "audio"; mimeType: string; data: string };

export interface LocalChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: LocalChatContent[];
  reasoning?: string;
}

export interface LocalChatRequest {
  modelId: string;
  systemPrompt: string;
  messages: LocalChatMessage[];
  tools: LocalToolDefinition[];
  reasoningMode?: LocalReasoningMode;
  temperature?: number;
  maxTokens?: number;
}

export interface LocalAsrRequest {
  modelId: string;
  audio: Float32Array;
  language: string;
  returnTimestamps?: "word";
}

export type LocalModelTask =
  | { kind: "asr.transcribe"; input: LocalAsrRequest }
  | { kind: "chat.generate"; input: LocalChatRequest }
  | { kind: "model.preload"; input: { modelId: string } };

export interface LocalModelRequestEnvelope<TTask extends LocalModelTask = LocalModelTask> {
  type: "run";
  requestId: string;
  priority: LocalModelPriority;
  task: TTask;
}

export interface LocalModelCancelMessage {
  type: "cancel";
  requestId: string;
}

export type LocalModelWorkerMessage = LocalModelRequestEnvelope | LocalModelCancelMessage;

export type LocalModelCommonEvent =
  | { type: "status"; status: LocalModelTaskStatus }
  | { type: "model-progress"; file?: string; progress?: number; total?: number }
  | { type: "error"; error: LocalModelError };

export type LocalAsrEvent =
  | LocalModelCommonEvent
  | { type: "transcript-delta"; text: string }
  | {
      type: "transcript-complete";
      text: string;
      chunks?: Array<{ text: string; timestamp: [number, number] }>;
      audioLength?: number;
    };

export type LocalChatEvent =
  | LocalModelCommonEvent
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "reasoning-done"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { type: "tool-call-start"; toolCall: { id: string; name: string } }
  | { type: "tool-call-args-delta"; toolCallId: string; delta: string }
  | {
      type: "tool-call-complete";
      toolCall: { id: string; name: string; arguments: Record<string, unknown> };
    }
  | { type: "chat-complete" };

export type LocalModelEvent = LocalAsrEvent | LocalChatEvent;

export interface LocalModelEventEnvelope<TEvent extends LocalModelEvent = LocalModelEvent> {
  requestId: string;
  event: TEvent;
}
