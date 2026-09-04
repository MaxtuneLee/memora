import { Toast } from "@base-ui/react/toast";
import { useAppStore } from "@/livestore/store";
import { useCallback, useMemo, useState } from "react";
import OnboardingExperience, {
  type OnboardingProfileInput,
} from "@/components/onboarding/OnboardingExperience";
import {
  useLocalModelDownloadActions,
  useLocalModelsReady,
} from "@/hooks/settings/useLocalModelDownloadSettings";
import { getLocalChatModelOptions } from "@/lib/local-model";
import { generatePersonalityMarkdownWithAI } from "@/lib/chat/personalityGenerator";
import { useFeatureModels } from "@/hooks/settings/useFeatureModels";
import { fetchProviderModels } from "@/lib/settings/providerModels";
import { normalizeProviderEndpoint } from "@/lib/settings/providerEndpoint";
import { resolveFeatureModelTarget } from "@/lib/models/modelRouting";
import { settingsProvidersQuery$ } from "@/lib/settings/queries";
import { loadGlobalMemoryData, saveGlobalMemoryData } from "@/lib/settings/personalityStorage";
import { providerEvents, type provider as ProviderRow } from "@/livestore/provider";
import { providerCredentialEvents } from "@/livestore/providerCredential";
import { useProviderCredentials } from "@/hooks/settings/useProviderCredentials";
import { settingEvents } from "@/livestore/setting";
import type { ProviderFormState } from "@/types/settingsDialog";

const LOCAL_CHAT_MODEL_OPTIONS = getLocalChatModelOptions();

export const Component = () => {
  const store = useAppStore();
  const { routing, createRuntime, setFeatureModel } = useFeatureModels();
  const { add } = Toast.useToastManager();
  const providers = store.useQuery(settingsProvidersQuery$) as ProviderRow[];
  const getProviderApiKey = useProviderCredentials();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingSoulDocument, setStreamingSoulDocument] = useState("");
  const { handleDownloadLocalModel } = useLocalModelDownloadActions({
    open: true,
    modelOptions: LOCAL_CHAT_MODEL_OPTIONS,
  });
  const personalityTarget = useMemo(() => {
    try {
      return resolveFeatureModelTarget("personality", routing);
    } catch {
      return null;
    }
  }, [routing]);
  const requiredModelIds = useMemo(
    () => (personalityTarget?.source === "local" ? [personalityTarget.modelId] : []),
    [personalityTarget],
  );
  const localModelOptions = useMemo(
    () => LOCAL_CHAT_MODEL_OPTIONS.filter((model) => requiredModelIds.includes(model.id)),
    [requiredModelIds],
  );
  const localModelsReady = useLocalModelsReady(requiredModelIds);
  const requiredModelsReady =
    personalityTarget?.source === "local"
      ? localModelsReady
      : !!personalityTarget &&
        providers.some(
          (provider) => provider.id === personalityTarget.providerId && !!provider.baseUrl.trim(),
        );

  const markOnboardingCompleted = useCallback(
    (input: OnboardingProfileInput) => {
      store.commit(
        settingEvents.settingsSet({
          onboardingName: input.name.trim(),
          onboardingCompleted: true,
          onboardingSkippedAt: "",
        }),
      );
    },
    [store],
  );

  const handleCreateProvider = useCallback(
    (providerForm: ProviderFormState): void => {
      const id = crypto.randomUUID();
      store.commit(
        providerEvents.providerCreated({
          id,
          name: providerForm.name.trim(),
          baseUrl: normalizeProviderEndpoint(providerForm.baseUrl),
          apiFormat: providerForm.apiFormat,
          createdAt: new Date(),
        }),
        providerCredentialEvents.providerCredentialSet({
          providerId: id,
          baseUrl: normalizeProviderEndpoint(providerForm.baseUrl),
          apiKey: providerForm.apiKey.trim(),
        }),
      );
    },
    [store],
  );

  const handleUpdateProvider = useCallback(
    (providerId: string, providerForm: ProviderFormState): void => {
      store.commit(
        providerEvents.providerUpdated({
          id: providerId,
          name: providerForm.name.trim(),
          baseUrl: normalizeProviderEndpoint(providerForm.baseUrl),
          apiFormat: providerForm.apiFormat,
          updatedAt: new Date(),
        }),
        providerCredentialEvents.providerCredentialSet({
          providerId,
          baseUrl: normalizeProviderEndpoint(providerForm.baseUrl),
          apiKey: providerForm.apiKey.trim(),
        }),
      );
    },
    [store],
  );

  const handleDeleteProvider = useCallback(
    (providerId: string): void => {
      store.commit(
        providerEvents.providerDeleted({ id: providerId, deletedAt: new Date() }),
        providerCredentialEvents.providerCredentialDeleted({ providerId }),
      );
      if (routing.assistant.providerId === providerId)
        setFeatureModel("assistant", { source: "cloud", providerId: "", modelId: "" });
    },
    [routing.assistant.providerId, setFeatureModel, store],
  );

  const handleFetchProviderModels = useCallback(
    async (provider: ProviderRow): Promise<void> => {
      try {
        const models = await fetchProviderModels(provider.baseUrl, getProviderApiKey(provider));

        store.commit(
          providerEvents.providerUpdated({
            id: provider.id,
            models: JSON.stringify(models),
            updatedAt: new Date(),
          }),
        );

        add({
          title: `Fetched ${models.length} model${models.length === 1 ? "" : "s"}`,
          type: "success",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        add({
          title: "Failed to fetch models",
          description: message,
          type: "error",
        });
        throw error;
      }
    },
    [add, getProviderApiKey, store],
  );

  const handleComplete = useCallback(
    async (input: OnboardingProfileInput) => {
      if (isSaving) {
        return;
      }

      setIsSaving(true);
      setErrorMessage(null);
      setStreamingSoulDocument("");

      try {
        const personality = await generatePersonalityMarkdownWithAI({
          runtime: createRuntime("personality"),
          userName: input.name,
          primaryUseCase: input.primaryUseCase,
          assistantStyle: input.assistantStyle,
          onTextDelta: (text) => {
            setStreamingSoulDocument(text);
          },
        });

        const existing = (await loadGlobalMemoryData()) ?? { notices: [] };

        await saveGlobalMemoryData({
          personality,
          notices: existing.notices,
        });

        markOnboardingCompleted(input);
        setStreamingSoulDocument("");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not generate Soul Document. Please try again.",
        );
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [createRuntime, isSaving, markOnboardingCompleted],
  );

  const experienceKey = useMemo(() => "onboarding-experience-v2", []);

  return (
    <OnboardingExperience
      key={experienceKey}
      isSaving={isSaving}
      errorMessage={errorMessage}
      streamingSoulDocument={streamingSoulDocument}
      providers={providers}
      getProviderApiKey={getProviderApiKey}
      localModelOptions={localModelOptions}
      requiredModelsReady={requiredModelsReady}
      onDownloadLocalModel={handleDownloadLocalModel}
      onCreateProvider={handleCreateProvider}
      onUpdateProvider={handleUpdateProvider}
      onDeleteProvider={handleDeleteProvider}
      onFetchProviderModels={handleFetchProviderModels}
      onComplete={handleComplete}
    />
  );
};
