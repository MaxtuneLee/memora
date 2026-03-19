import { useEffect, useMemo } from "react";
import type { AgentConfig } from "@memora/ai-core";
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
    return (
      providers.find((provider) => provider.id === settings.selectedProviderId) ??
      null
    );
  }, [providers, settings.selectedProviderId]);
  const selectedModel = settings.selectedModel.trim();
  const selectedProviderModels = useMemo(() => {
    return selectedProvider ? parseProviderModels(selectedProvider) : [];
  }, [selectedProvider]);
  const selectedModelInfo = useMemo(() => {
    return selectedModel
      ? selectedProviderModels.find((model) => model.id === selectedModel) ?? null
      : null;
  }, [selectedModel, selectedProviderModels]);
  const selectedApiFormat = (selectedProvider?.apiFormat ??
    "chat-completions") as "chat-completions" | "responses";
  const selectedApiKey = selectedProvider?.apiKey.trim() ?? "";
  const selectedEndpoint = useMemo(() => {
    if (!selectedProvider) {
      return "";
    }
    const baseUrl = selectedProvider.baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      return "";
    }
    return selectedApiFormat === "responses"
      ? `${baseUrl}/responses`
      : `${baseUrl}/chat/completions`;
  }, [selectedApiFormat, selectedProvider]);
  const agentConfig = useMemo((): Partial<AgentConfig> => {
    const sessionScopedAgentId = activeSessionId
      ? `memora-chat:${activeSessionId}`
      : "memora-chat:bootstrap";
    if (!selectedProvider || !selectedModel || !selectedEndpoint) {
      return {
        id: sessionScopedAgentId,
        model: "",
        endpoint: "",
        apiFormat: "chat-completions",
      };
    }
    return {
      id: sessionScopedAgentId,
      model: selectedModel,
      endpoint: selectedEndpoint,
      apiKey: selectedApiKey || undefined,
      apiFormat: selectedApiFormat,
      maxIterations: 20,
    };
  }, [
    activeSessionId,
    selectedApiFormat,
    selectedApiKey,
    selectedEndpoint,
    selectedModel,
    selectedProvider,
  ]);
  const isConfigured =
    !!selectedProvider && !!selectedModel && !!selectedEndpoint;

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
        maxOutputTokens: model.maxOutputTokens,
      })),
    });
  }, [
    selectedModel,
    selectedModelInfo,
    selectedProvider,
    selectedProviderModels,
  ]);

  return {
    agentConfig,
    isConfigured,
    selectedApiFormat,
    selectedApiKey,
    selectedEndpoint,
    selectedModel,
    selectedModelInfo,
  };
};
