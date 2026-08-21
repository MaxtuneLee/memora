import { useEffect, useMemo } from "react";
import type { AgentConfig } from "@memora/ai-core";
import { createRemotePiRuntime, type PiModelRuntime } from "@memora/ai-provider-pi";
import type { provider as ProviderRow } from "@/livestore/provider";
import { parseProviderModels } from "@/lib/settings/dialogHelpers";
import { IS_DEV } from "./helpers";

interface ChatSettingsLike {
  selectedProviderId: string;
  selectedModel: string;
}

export const useChatModelConfig = ({
  providers,
  settings,
  activeSessionId,
}: {
  providers: ProviderRow[];
  settings: ChatSettingsLike;
  activeSessionId: string;
}) => {
  const selectedProvider = useMemo(() => {
    return providers.find((provider) => provider.id === settings.selectedProviderId) ?? null;
  }, [providers, settings.selectedProviderId]);
  const selectedModel = settings.selectedModel.trim();
  const selectedProviderModels = useMemo(() => {
    return selectedProvider ? parseProviderModels(selectedProvider) : [];
  }, [selectedProvider]);
  const selectedModelInfo = useMemo(() => {
    return selectedModel
      ? (selectedProviderModels.find((model) => model.id === selectedModel) ?? null)
      : null;
  }, [selectedModel, selectedProviderModels]);
  const selectedApiFormat = (selectedProvider?.apiFormat ?? "chat-completions") as
    | "chat-completions"
    | "responses";
  const selectedApiKey = selectedProvider?.apiKey.trim() ?? "";
  const selectedBaseUrl = useMemo(() => {
    if (!selectedProvider) {
      return "";
    }
    const baseUrl = selectedProvider.baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      return "";
    }
    return baseUrl;
  }, [selectedProvider]);
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
    };
  }, [activeSessionId, selectedBaseUrl, selectedModel, selectedProvider]);

  const runtime = useMemo((): PiModelRuntime | null => {
    if (!selectedProvider || !selectedModel || !selectedBaseUrl || !selectedModelInfo) {
      return null;
    }

    return createRemotePiRuntime({
      id: selectedProvider.id,
      name: selectedProvider.name,
      baseUrl: selectedBaseUrl,
      apiKey: selectedApiKey || undefined,
      apiFormat: selectedApiFormat,
      models: selectedProviderModels,
      selectedModelId: selectedModel,
    });
  }, [
    selectedApiFormat,
    selectedApiKey,
    selectedBaseUrl,
    selectedModel,
    selectedModelInfo,
    selectedProvider,
    selectedProviderModels,
  ]);
  const isConfigured = runtime !== null;

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

  return {
    agentConfig,
    runtime,
    isConfigured,
    selectedApiFormat,
    selectedApiKey,
    selectedBaseUrl,
    selectedModel,
    selectedModelInfo,
  };
};
