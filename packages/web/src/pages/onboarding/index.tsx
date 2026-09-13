import { Toast } from "@base-ui/react/toast";
import { whisperBaseTimestampedManifest } from "@memora/local-model-runtime";
import { useAppStore } from "@/livestore/store";
import { useCallback, useMemo, useState } from "react";
import OnboardingExperience, {
  type OnboardingProfileInput,
} from "@/components/onboarding/OnboardingExperience";
import { useFeatureModels } from "@/hooks/settings/useFeatureModels";
import { useTranscript } from "@/hooks/transcript/useTranscript";
import { fetchProviderModels } from "@/lib/settings/providerModels";
import { normalizeProviderEndpoint } from "@/lib/settings/providerEndpoint";
import { settingsDocumentQuery$, settingsProvidersQuery$ } from "@/lib/settings/queries";
import { savePersonalityProfile } from "@/lib/settings/personalityStorage";
import { providerEvents, type provider as ProviderRow } from "@/livestore/provider";
import { providerCredentialEvents } from "@/livestore/providerCredential";
import { useProviderCredentials } from "@/hooks/settings/useProviderCredentials";
import {
  normalizeSettingsValue,
  settingEvents,
  settingsTable,
  type setting,
} from "@/livestore/setting";
import type { ProviderFormState } from "@/types/settingsDialog";

export const Component = () => {
  const store = useAppStore();
  const { routing, setFeatureModel } = useFeatureModels();
  const transcript = useTranscript();
  const { add } = Toast.useToastManager();
  const providers = store.useQuery(settingsProvidersQuery$) as ProviderRow[];
  const settings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const getProviderApiKey = useProviderCredentials();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requiredModelsReady =
    !!routing.assistant.providerId &&
    !!routing.assistant.modelId &&
    providers.some(
      (provider) => provider.id === routing.assistant.providerId && !!provider.baseUrl.trim(),
    );
  // Onboarding only offers local Fast/Accurate modes; a cloud transcription route
  // (set elsewhere, e.g. Settings) has no Fast/Accurate equivalent, so default the
  // picker to Accurate rather than reflect an unrelated cloud choice.
  const transcriptionModelId =
    routing.transcription.source === "local"
      ? routing.transcription.modelId
      : whisperBaseTimestampedManifest.id;
  const handleSelectTranscriptionMode = useCallback(
    (modelId: string) => {
      setFeatureModel("transcription", { source: "local", modelId });
    },
    [setFeatureModel],
  );

  const markOnboardingCompleted = useCallback(
    (input: OnboardingProfileInput) => {
      store.commit(
        settingEvents.settingsSet({
          onboardingName: input.name.trim(),
          onboardingCompleted: true,
          onboardingSkippedAt: "",
          primaryUseCase: input.primaryUseCase.trim(),
          assistantStyle: input.assistantStyle.trim(),
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

      try {
        await savePersonalityProfile({
          name: input.name,
          primaryUseCase: input.primaryUseCase,
          assistantStyle: input.assistantStyle,
          customInstructions: settings.customInstructions ?? "",
        });

        markOnboardingCompleted(input);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not save your profile. Please try again.",
        );
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, markOnboardingCompleted, settings.customInstructions],
  );

  const experienceKey = useMemo(() => "onboarding-experience-v2", []);

  return (
    <OnboardingExperience
      key={experienceKey}
      isSaving={isSaving}
      errorMessage={errorMessage}
      providers={providers}
      getProviderApiKey={getProviderApiKey}
      requiredModelsReady={requiredModelsReady}
      transcript={transcript}
      transcriptionModelId={transcriptionModelId}
      onSelectTranscriptionMode={handleSelectTranscriptionMode}
      onCreateProvider={handleCreateProvider}
      onUpdateProvider={handleUpdateProvider}
      onDeleteProvider={handleDeleteProvider}
      onFetchProviderModels={handleFetchProviderModels}
      onComplete={handleComplete}
    />
  );
};
