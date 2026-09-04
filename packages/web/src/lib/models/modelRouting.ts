export const AI_FEATURES = [
  {
    id: "assistant",
    label: "Chat",
    task: "chat",
    description: "Conversations and tools always use a cloud model.",
  },
  {
    id: "transcription",
    label: "Transcription",
    task: "asr",
    description: "Recorded files and live speech.",
  },
  {
    id: "personality",
    label: "Personality",
    task: "chat",
    description: "Create the assistant profile during setup.",
  },
  {
    id: "sessionTitle",
    label: "Conversation titles",
    task: "chat",
    description: "Name conversations from their first messages.",
  },
  {
    id: "memoryExtraction",
    label: "Memory preferences",
    task: "chat",
    description: "Extract lasting communication preferences.",
  },
  {
    id: "imageExtraction",
    label: "Images and scanned pages",
    task: "vision",
    description: "Read text, tables, and layout from images and scanned documents.",
  },
  {
    id: "formulaRecognition",
    label: "Formula recognition",
    task: "vision",
    description: "Read formula regions when using the local image pipeline.",
  },
  {
    id: "embedding",
    label: "Semantic search",
    task: "embedding",
    description: "Embed indexed content and search queries using the same model.",
  },
] as const;

export type AiFeatureId = (typeof AI_FEATURES)[number]["id"];
export type ChatFeatureId = "assistant" | "personality" | "sessionTitle" | "memoryExtraction";
export type TextGenerationFeatureId = ChatFeatureId | "imageExtraction" | "formulaRecognition";

export interface CloudModelTarget {
  source: "cloud";
  providerId: string;
  modelId: string;
  dimensions?: number;
}

export interface LocalModelTarget {
  source: "local";
  modelId: string;
}

export interface InheritedModelTarget {
  source: "inherit";
  featureId: "assistant";
}

export type ModelTarget = CloudModelTarget | LocalModelTarget;
export type FeatureModelRoute = ModelTarget | InheritedModelTarget;

export interface AiModelRouting {
  assistant: CloudModelTarget;
  transcription: ModelTarget;
  personality: FeatureModelRoute;
  sessionTitle: FeatureModelRoute;
  memoryExtraction: FeatureModelRoute;
  imageExtraction: ModelTarget;
  formulaRecognition: ModelTarget;
  embedding: ModelTarget;
}

export const DEFAULT_AI_MODEL_ROUTING: AiModelRouting = {
  assistant: { source: "cloud", providerId: "", modelId: "" },
  transcription: { source: "local", modelId: "whisper-base-timestamped" },
  personality: { source: "inherit", featureId: "assistant" },
  sessionTitle: { source: "inherit", featureId: "assistant" },
  memoryExtraction: { source: "inherit", featureId: "assistant" },
  imageExtraction: { source: "local", modelId: "paddle-document-pipeline" },
  formulaRecognition: { source: "local", modelId: "texo" },
  embedding: { source: "local", modelId: "bge-m3" },
};

const LOCAL_CHAT_MODELS = ["gemma-4-e2b-it-onnx", "qwen3.5-0.8b-onnx-opt"] as const;

export const LOCAL_FEATURE_MODELS: Record<AiFeatureId, readonly string[]> = {
  assistant: [],
  transcription: ["whisper-base-timestamped"],
  personality: LOCAL_CHAT_MODELS,
  sessionTitle: LOCAL_CHAT_MODELS,
  memoryExtraction: LOCAL_CHAT_MODELS,
  imageExtraction: ["paddle-document-pipeline"],
  formulaRecognition: ["texo"],
  embedding: ["bge-m3", "bge-small-en"],
};

export const canInheritChatModel = (feature: AiFeatureId): boolean =>
  feature === "personality" || feature === "sessionTitle" || feature === "memoryExtraction";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseFeatureModelRoute = (
  feature: AiFeatureId,
  value: unknown,
): FeatureModelRoute | null => {
  if (!isRecord(value)) return null;
  if (
    value.source === "inherit" &&
    value.featureId === "assistant" &&
    canInheritChatModel(feature)
  ) {
    return { source: "inherit", featureId: "assistant" };
  }
  if (typeof value.modelId !== "string") return null;
  if (value.source === "local" && LOCAL_FEATURE_MODELS[feature].includes(value.modelId)) {
    return { source: "local", modelId: value.modelId };
  }
  if (value.source !== "cloud" || typeof value.providerId !== "string") return null;
  if (
    value.dimensions !== undefined &&
    (feature !== "embedding" ||
      typeof value.dimensions !== "number" ||
      !Number.isInteger(value.dimensions) ||
      value.dimensions < 1 ||
      value.dimensions > 65536)
  )
    return null;
  return {
    source: "cloud",
    providerId: value.providerId.trim(),
    modelId: value.modelId.trim(),
    ...(typeof value.dimensions === "number" ? { dimensions: value.dimensions } : {}),
  };
};

export const normalizeAiModelRouting = (
  value: unknown,
  legacy?: { selectedProviderId?: string; selectedModel?: string },
): AiModelRouting => {
  const record = isRecord(value) ? value : {};
  const assistant: CloudModelTarget = {
    source: "cloud",
    providerId: legacy?.selectedProviderId?.trim() ?? "",
    modelId: legacy?.selectedModel?.trim() ?? "",
  };
  const result = { ...DEFAULT_AI_MODEL_ROUTING, assistant };
  for (const feature of AI_FEATURES) {
    const route = parseFeatureModelRoute(feature.id, record[feature.id]);
    if (route) Object.assign(result, { [feature.id]: route });
    else if (record[feature.id] !== undefined)
      Object.assign(result, { [feature.id]: { source: "cloud", providerId: "", modelId: "" } });
  }
  return result;
};

export const resolveFeatureModelTarget = (
  feature: AiFeatureId,
  routing: AiModelRouting,
): ModelTarget => {
  const route = parseFeatureModelRoute(feature, routing[feature]);
  if (!route)
    throw new Error(`The model configured for ${feature} is not compatible with this feature.`);
  const target =
    route.source === "inherit" ? parseFeatureModelRoute("assistant", routing.assistant) : route;
  if (!target || target.source === "inherit")
    throw new Error("Choose a cloud model for chat first.");
  if (target.source === "cloud" && (!target.providerId || !target.modelId)) {
    throw new Error(
      `Choose a provider and model for ${AI_FEATURES.find((entry) => entry.id === feature)?.label ?? feature}.`,
    );
  }
  return target;
};
