import { Toast } from "@base-ui/react/toast";
import { useStore } from "@livestore/react";
import { useCallback, useMemo, useState } from "react";
import OnboardingExperience, {
  type OnboardingProfileInput,
} from "@/components/onboarding/OnboardingExperience";
import { useLocalModelDownloadSettings } from "@/hooks/settings/useLocalModelDownloadSettings";
import { getLocalChatModelOptions, getRequiredOnboardingModelOptions } from "@/lib/local-model";
import { generatePersonalityMarkdownWithAI } from "@/lib/chat/personalityGenerator";
import { ONBOARDING_GEMMA_MODEL_ID } from "@/lib/onboarding/onboardingGate";
import { parseProviderModel, parseProviderModels } from "@/lib/settings/dialogHelpers";
import { settingsProvidersQuery$ } from "@/lib/settings/queries";
import { loadGlobalMemoryData, saveGlobalMemoryData } from "@/lib/settings/personalityStorage";
import { providerEvents, type provider as ProviderRow } from "@/livestore/provider";
import { settingEvents } from "@/livestore/setting";
import type { ModelInfo, ProviderFormState } from "@/types/settingsDialog";

const LOCAL_CHAT_MODEL_OPTIONS = getLocalChatModelOptions();
const REQUIRED_ONBOARDING_MODEL_OPTIONS = getRequiredOnboardingModelOptions();
const ONBOARDING_MODEL_OPTIONS = [
  ...REQUIRED_ONBOARDING_MODEL_OPTIONS,
  ...LOCAL_CHAT_MODEL_OPTIONS.filter(
    (model) => !REQUIRED_ONBOARDING_MODEL_OPTIONS.some((required) => required.id === model.id),
  ),
];

const getInitialProviderSelection = (
  providers: ProviderRow[],
): { providerId: string; modelId: string } => {
  for (const provider of providers) {
    const firstModel = parseProviderModels(provider)[0];
    if (firstModel?.id) {
      return {
        providerId: provider.id,
        modelId: firstModel.id,
      };
    }
  }

  return { providerId: "", modelId: "" };
};

export const Component = () => {
  const { store } = useStore();
  const { add } = Toast.useToastManager();
  const providers = store.useQuery(settingsProvidersQuery$) as ProviderRow[];
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingSoulDocument, setStreamingSoulDocument] = useState("");
  const { localModelStates, handleDownloadLocalModel } = useLocalModelDownloadSettings({
    open: true,
    modelOptions: ONBOARDING_MODEL_OPTIONS,
  });

  const markOnboardingCompleted = useCallback(
    (input: OnboardingProfileInput, providerSelection: { providerId: string; modelId: string }) => {
      store.commit(
        settingEvents.settingsSet({
          selectedProviderId: providerSelection.providerId,
          selectedModel: providerSelection.modelId,
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
      store.commit(
        providerEvents.providerCreated({
          id: crypto.randomUUID(),
          name: providerForm.name.trim(),
          baseUrl: providerForm.baseUrl.trim().replace(/\/+$/, ""),
          apiKey: providerForm.apiKey,
          apiFormat: providerForm.apiFormat,
          createdAt: new Date(),
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
          baseUrl: providerForm.baseUrl.trim().replace(/\/+$/, ""),
          apiKey: providerForm.apiKey,
          apiFormat: providerForm.apiFormat,
          updatedAt: new Date(),
        }),
      );
    },
    [store],
  );

  const handleDeleteProvider = useCallback(
    (providerId: string): void => {
      store.commit(providerEvents.providerDeleted({ id: providerId, deletedAt: new Date() }));
      store.commit(
        settingEvents.settingsSet({
          selectedProviderId: "",
          selectedModel: "",
        }),
      );
    },
    [store],
  );

  const handleFetchProviderModels = useCallback(
    async (provider: ProviderRow): Promise<void> => {
      try {
        const baseUrl = provider.baseUrl.replace(/\/+$/, "");
        const headers: Record<string, string> = {};
        if (provider.apiKey) {
          headers.Authorization = `Bearer ${provider.apiKey}`;
        }

        const response = await fetch(`${baseUrl}/models`, { headers });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status}: ${text.slice(0, 200)}`);
        }

        const json = (await response.json()) as {
          data?: unknown[];
          models?: unknown[];
        };
        const rawModels = json.data ?? json.models ?? [];
        const models: ModelInfo[] = rawModels.flatMap((model) => {
          const parsedModel = parseProviderModel(model);
          return parsedModel ? [parsedModel] : [];
        });

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
    [add, store],
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
          useLocalModel: true,
          endpoint: "",
          apiKey: "",
          model: ONBOARDING_GEMMA_MODEL_ID,
          apiFormat: "chat-completions",
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

        markOnboardingCompleted(input, getInitialProviderSelection(providers));
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
    [isSaving, markOnboardingCompleted, providers],
  );

  const experienceKey = useMemo(() => "onboarding-experience-v2", []);

  return (
    <OnboardingExperience
      key={experienceKey}
      isSaving={isSaving}
      errorMessage={errorMessage}
      streamingSoulDocument={streamingSoulDocument}
      providers={providers}
      localModelOptions={REQUIRED_ONBOARDING_MODEL_OPTIONS}
      localModelStates={localModelStates}
      onDownloadLocalModel={handleDownloadLocalModel}
      onCreateProvider={handleCreateProvider}
      onUpdateProvider={handleUpdateProvider}
      onDeleteProvider={handleDeleteProvider}
      onFetchProviderModels={handleFetchProviderModels}
      onComplete={handleComplete}
    />
  );
};
