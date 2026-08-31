import {
  createLocalPiRuntime,
  createRemotePiRuntime,
  type PiModelRuntime,
} from "@memora/ai-provider-pi";
import { getLocalModelManifest } from "@memora/local-model-runtime";

import { localModelClient } from "@/lib/local-model";
import { trackLocalTokenUsage, type LocalTokenUsage } from "./localTokenUsage";
import { parseProviderModels } from "@/lib/settings/dialogHelpers";
import type { provider } from "@/livestore/provider";
import { readProviderApiKey, type providerCredentialTable } from "@/livestore/providerCredential";
import {
  resolveFeatureModelTarget,
  type AiModelRouting,
  type TextGenerationFeatureId,
} from "./modelRouting";

export interface FeatureRuntimeContext {
  routing: AiModelRouting;
  providers: readonly provider[];
  credentials: readonly (typeof providerCredentialTable.Type)[];
  onLocalUsage?: (usage: LocalTokenUsage) => void;
  onCloudUsage?: (usage: LocalTokenUsage) => void;
}

export const createFeatureChatRuntime = (
  feature: TextGenerationFeatureId,
  context: FeatureRuntimeContext,
  priority: "interactive" | "background" = "interactive",
): PiModelRuntime => {
  const target = resolveFeatureModelTarget(feature, context.routing);
  if (target.source === "local") {
    const manifest = getLocalModelManifest(target.modelId);
    if (!manifest?.chat)
      throw new Error(`The local model for ${feature} does not support language generation.`);
    const record = context.onLocalUsage;
    const client = record
      ? {
          ...localModelClient,
          streamChat: (...args: Parameters<typeof localModelClient.streamChat>) =>
            trackLocalTokenUsage(localModelClient.streamChat(...args), record, args[1]?.signal),
        }
      : localModelClient;
    return createLocalPiRuntime({ client, manifest, priority });
  }
  const provider = context.providers.find(
    (entry) => entry.id === target.providerId && !entry.deletedAt,
  );
  if (!provider)
    throw new Error(
      `The provider for ${feature} is unavailable. Choose another provider in Model routing.`,
    );
  const registeredModel = parseProviderModels(provider).find(
    (entry) => entry.id === target.modelId,
  );
  const requiresImage = feature === "imageExtraction" || feature === "formulaRecognition";
  if (requiresImage && registeredModel && !registeredModel.input.includes("image")) {
    throw new Error("Choose a model that supports image input for image or formula recognition.");
  }
  return createRemotePiRuntime({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: readProviderApiKey(provider, context.credentials) || undefined,
    apiFormat: provider.apiFormat,
    selectedModelId: target.modelId,
    models: [
      registeredModel ?? {
        id: target.modelId,
        name: target.modelId,
        reasoning: false,
        input: requiresImage ? ["text", "image"] : ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 4096,
      },
    ],
    ...(context.onCloudUsage ? { onUsage: context.onCloudUsage } : {}),
  });
};
