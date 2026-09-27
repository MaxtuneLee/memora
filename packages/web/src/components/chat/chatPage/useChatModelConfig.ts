import { useEffect, useMemo } from "react";
import type { AgentConfig } from "@memora/ai-core";
import type { provider as ProviderRow } from "@/livestore/provider";
import { DEFAULT_MODEL_CONTEXT_WINDOW, parseProviderModels } from "@/lib/settings/dialogHelpers";
import { useProviderCredentials } from "@/hooks/settings/useProviderCredentials";
import { useModelRouting } from "@/hooks/settings/useModelRouting";
import { IS_DEV } from "./helpers";

const fallbackModelInfo = (id: string) => ({
  id,
  name: id,
  reasoning: false,
  input: ["text"] as Array<"text" | "image">,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: DEFAULT_MODEL_CONTEXT_WINDOW,
  maxTokens: 4096,
});

const normalizeBaseUrl = (provider: ProviderRow): string =>
  provider.baseUrl.trim().replace(/\/+$/, "");

interface ChatSettingsLike {
  selectedProviderId: string;
  selectedModel: string;
}

export const useChatModelConfig = ({
  providers,
  activeSessionId,
}: {
  providers: ProviderRow[];
  settings: ChatSettingsLike;
  activeSessionId: string;
}) => {
  const getProviderApiKey = useProviderCredentials();
  const { routing } = useModelRouting();
  const selectedProvider = useMemo(() => {
    return (
      providers.find(
        (provider) => provider.id === routing.assistant.providerId && !provider.deletedAt,
      ) ?? null
    );
  }, [providers, routing.assistant.providerId]);
  const selectedModel = routing.assistant.modelId.trim();
  const selectedProviderModels = useMemo(() => {
    return selectedProvider ? parseProviderModels(selectedProvider) : [];
  }, [selectedProvider]);
  const selectedModelInfo = useMemo(() => {
    return selectedModel
      ? (selectedProviderModels.find((model) => model.id === selectedModel) ??
          fallbackModelInfo(selectedModel))
      : null;
  }, [selectedModel, selectedProviderModels]);
  const selectedApiFormat = (selectedProvider?.apiFormat ?? "chat-completions") as
    | "chat-completions"
    | "responses";
  const selectedApiKey = selectedProvider ? getProviderApiKey(selectedProvider).trim() : "";
  const selectedBaseUrl = selectedProvider ? normalizeBaseUrl(selectedProvider) : "";
  const agentConfig = useMemo((): Partial<AgentConfig> => {
    const sessionScopedAgentId = activeSessionId
      ? `memora-chat:${activeSessionId}`
      : "memora-chat:bootstrap";
    if (!selectedProvider || !selectedModel || !selectedBaseUrl) {
      return {
        id: sessionScopedAgentId,
      };
    }
    return {
      id: sessionScopedAgentId,
      maxIterations: 20,
      compaction: true,
    };
  }, [activeSessionId, selectedBaseUrl, selectedModel, selectedProvider]);

  const isConfigured = Boolean(
    selectedProvider && selectedModel && selectedBaseUrl && selectedModelInfo,
  );

  useEffect(() => {
    if (!IS_DEV || !selectedProvider || !selectedModel) {
      return;
    }

    console.info("[chat-context] selected-model-meta", {
      providerId: selectedProvider.id,
      providerName: selectedProvider.name,
      selectedModel,
      matched: selectedModelInfo !== null,
      selectedModelInfo,
      parsedModels: selectedProviderModels.map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      })),
    });
  }, [selectedModel, selectedModelInfo, selectedProvider, selectedProviderModels]);

  // Following the chat model sends nothing, so the worker reuses the chat runtime.
  const compactionRoute = routing.contextCompaction;
  const compactionProviderConfig = useMemo(() => {
    if (compactionRoute.source !== "cloud" || !compactionRoute.modelId) return undefined;
    const provider = providers.find(
      (entry) => entry.id === compactionRoute.providerId && !entry.deletedAt,
    );
    if (!provider || !normalizeBaseUrl(provider)) return undefined;
    const modelId = compactionRoute.modelId;
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: normalizeBaseUrl(provider),
      apiKey: getProviderApiKey(provider).trim() || undefined,
      apiFormat: (provider.apiFormat ?? "chat-completions") as "chat-completions" | "responses",
      models: [
        parseProviderModels(provider).find((model) => model.id === modelId) ??
          fallbackModelInfo(modelId),
      ],
      selectedModelId: modelId,
    };
  }, [compactionRoute, providers, getProviderApiKey]);

  return {
    agentConfig,
    compactionProviderConfig,
    providerConfig:
      isConfigured && selectedProvider && selectedModelInfo
        ? {
            id: selectedProvider.id,
            name: selectedProvider.name,
            baseUrl: selectedBaseUrl,
            apiKey: selectedApiKey || undefined,
            apiFormat: selectedApiFormat,
            models: [selectedModelInfo],
            selectedModelId: selectedModel,
          }
        : undefined,
    isConfigured,
    selectedApiFormat,
    selectedApiKey,
    selectedBaseUrl,
    selectedModel,
    selectedModelInfo,
  };
};
