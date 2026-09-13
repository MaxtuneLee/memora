import { Toast } from "@base-ui/react/toast";
import { useCallback } from "react";

import { savePersonalityProfile } from "@/lib/settings/personalityStorage";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import {
  normalizeSettingsValue,
  settingEvents,
  settingsTable,
  type setting,
} from "@/livestore/setting";
import { useAppStore } from "@/livestore/store";

type ProfileField = "onboardingName" | "primaryUseCase" | "assistantStyle" | "customInstructions";

export const usePersonalizationProfile = () => {
  const store = useAppStore();
  const { add } = Toast.useToastManager();
  const settings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const name = settings.onboardingName ?? "";
  const primaryUseCase = settings.primaryUseCase ?? "";
  const assistantStyle = settings.assistantStyle ?? "";
  const customInstructions = settings.customInstructions ?? "";

  const syncProfile = useCallback(
    (field: ProfileField, value: string) => {
      store.commit(settingEvents.settingsSet({ [field]: value }));
      savePersonalityProfile({
        name: field === "onboardingName" ? value : name,
        primaryUseCase: field === "primaryUseCase" ? value : primaryUseCase,
        assistantStyle: field === "assistantStyle" ? value : assistantStyle,
        customInstructions: field === "customInstructions" ? value : customInstructions,
      }).catch(() => {
        add({
          title: "Could not save your changes",
          description: "Your Personalization changes were not saved. Please try again.",
          type: "error",
        });
      });
    },
    [add, assistantStyle, customInstructions, name, primaryUseCase, store],
  );

  const handleNameChange = useCallback(
    (value: string) => syncProfile("onboardingName", value),
    [syncProfile],
  );
  const handleUseCaseChange = useCallback(
    (value: string) => syncProfile("primaryUseCase", value),
    [syncProfile],
  );
  const handleStyleChange = useCallback(
    (value: string) => syncProfile("assistantStyle", value),
    [syncProfile],
  );
  const handleCustomInstructionsChange = useCallback(
    (value: string) => syncProfile("customInstructions", value),
    [syncProfile],
  );

  return {
    name,
    primaryUseCase,
    assistantStyle,
    customInstructions,
    handleNameChange,
    handleUseCaseChange,
    handleStyleChange,
    handleCustomInstructionsChange,
  };
};
