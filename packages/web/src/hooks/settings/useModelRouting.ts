import { useAppStore } from "@/livestore/store";
import { useCallback, useMemo } from "react";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { settingEvents } from "@/livestore/setting";
import {
  normalizeAiModelRouting,
  parseFeatureModelRoute,
  type AiFeatureId,
  type FeatureModelRoute,
} from "@/lib/models/modelRouting";

export const useModelRouting = () => {
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$);
  const routing = useMemo(
    () => normalizeAiModelRouting(settings?.modelRouting, settings),
    [settings],
  );
  const setFeatureModel = useCallback(
    (feature: AiFeatureId, value: FeatureModelRoute) => {
      const route = parseFeatureModelRoute(feature, value);
      if (!route) throw new Error(`This model cannot be used for ${feature}.`);
      // Read the latest document so consecutive changes don't overwrite other features.
      const current = store.query(settingsDocumentQuery$);
      store.commit(
        settingEvents.settingsSet({
          modelRouting: { ...current?.modelRouting, [feature]: route },
          ...(feature === "assistant" && route.source === "cloud"
            ? { selectedProviderId: route.providerId, selectedModel: route.modelId }
            : {}),
        }),
      );
    },
    [store],
  );
  return { routing, setFeatureModel };
};
