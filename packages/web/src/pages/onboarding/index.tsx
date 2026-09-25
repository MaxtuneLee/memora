import { nemotron35AsrStreamingManifest } from "@memora/local-model-runtime";
import { useAppStore } from "@/livestore/store";
import { useCallback, useMemo, useState } from "react";
import OnboardingExperience, {
  type OnboardingProfileInput,
} from "@/components/onboarding/OnboardingExperience";
import { useFeatureModels } from "@/hooks/settings/useFeatureModels";
import { useTranscript } from "@/hooks/transcript/useTranscript";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { savePersonalityProfile } from "@/lib/settings/personalityStorage";
import {
  normalizeSettingsValue,
  settingEvents,
  settingsTable,
  type setting,
} from "@/livestore/setting";

export const Component = () => {
  const store = useAppStore();
  const { routing, setFeatureModel } = useFeatureModels();
  const transcript = useTranscript();
  const settings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Onboarding only offers local Fast/Accurate modes; a cloud transcription route
  // (set elsewhere, e.g. Settings) has no Fast/Accurate equivalent, so fall back to
  // the app-wide default (Fast/Nemotron) rather than reflect an unrelated cloud choice.
  const transcriptionModelId =
    routing.transcription.source === "local"
      ? routing.transcription.modelId
      : nemotron35AsrStreamingManifest.id;
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
      transcript={transcript}
      transcriptionModelId={transcriptionModelId}
      onSelectTranscriptionMode={handleSelectTranscriptionMode}
      onComplete={handleComplete}
    />
  );
};
