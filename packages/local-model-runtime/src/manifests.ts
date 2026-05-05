import type { LocalModelManifest } from "./types";

export const whisperBaseTimestampedManifest: LocalModelManifest = {
  id: "whisper-base-timestamped",
  displayName: "Whisper Base Timestamped",
  downloadSizeGB: 0.4,
  family: "whisper",
  task: "asr",
  modelId: "onnx-community/whisper-base_timestamped",
  runtime: "transformers-js",
  device: "webgpu",
  pool: "asr",
  modalities: {
    input: ["audio"],
    output: ["text"],
  },
  asr: {
    adapter: "whisper",
    supportsWordTimestamps: true,
  },
};

export const qwen35OnnxOptManifest: LocalModelManifest = {
  id: "qwen3.5-0.8b-onnx-opt",
  displayName: "Qwen3.5 0.8B ONNX OPT",
  family: "qwen",
  task: "chat",
  modelId: "onnx-community/Qwen3.5-0.8B-ONNX-OPT",
  runtime: "transformers-js",
  device: "webgpu",
  pool: "chat",
  modalities: {
    input: ["text", "image"],
    output: ["text", "tool-call"],
  },
  dtype: {
    embed_tokens: "q4",
    vision_encoder: "fp16",
    decoder_model_merged: "q4",
  },
  limits: {
    contextWindow: 262144,
  },
  chat: {
    adapter: "qwen3.5",
    supportsSystemPrompt: true,
    supportsStreaming: true,
    supportsReasoning: true,
    reasoningModes: ["non-thinking", "thinking"],
    defaultReasoningMode: "non-thinking",
    supportsTools: true,
    toolCalling: {
      mode: "template-json",
      streamingArgs: false,
      requiresToolResultTemplate: true,
    },
  },
};

export const gemma4E2bOnnxManifest: LocalModelManifest = {
  id: "gemma-4-e2b-it-onnx",
  displayName: "Gemma 4 E2B IT ONNX",
  downloadSizeGB: 4.1,
  family: "gemma",
  task: "chat",
  modelId: "onnx-community/gemma-4-E2B-it-ONNX",
  runtime: "transformers-js",
  device: "webgpu",
  pool: "chat",
  modalities: {
    input: ["text", "image"],
    output: ["text", "tool-call"],
  },
  dtype: {
    audio_encoder: "fp16",
    vision_encoder: "fp16",
    embed_tokens: "q4f16",
    decoder_model_merged: "q4f16",
  },
  limits: {
    contextWindow: 131072,
  },
  chat: {
    adapter: "gemma4",
    supportsSystemPrompt: true,
    supportsStreaming: true,
    supportsReasoning: true,
    reasoningModes: ["non-thinking", "thinking"],
    defaultReasoningMode: "non-thinking",
    supportsTools: true,
    toolCalling: {
      mode: "native",
      streamingArgs: true,
      requiresToolResultTemplate: true,
    },
  },
};

export const builtInLocalModelManifests = [
  whisperBaseTimestampedManifest,
  qwen35OnnxOptManifest,
  gemma4E2bOnnxManifest,
] as const;
