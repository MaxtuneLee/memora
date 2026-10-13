import { useAppStore } from "@/livestore/store";
import { useCallback } from "react";

import { createFeatureChatRuntime } from "@/lib/models/chatRuntime";
import type { TextGenerationFeatureId } from "@/lib/models/modelRouting";
import { useCredentialVaultVersion } from "@/lib/settings/credentialVault";
import { settingsProvidersQuery$ } from "@/lib/settings/queries";
import { providerCredentialsQuery$ } from "@/livestore/providerCredential";
import { localModelUsageEvents } from "@/livestore/localModelUsage";
import { useModelRouting } from "./useModelRouting";

export const useFeatureModels = () => {
  const store = useAppStore();
  const { routing, setFeatureModel } = useModelRouting();
  const providers = store.useQuery(settingsProvidersQuery$);
  const credentials = store.useQuery(providerCredentialsQuery$);
  // Keys are read when a runtime is created; re-render consumers that show them after unlock.
  useCredentialVaultVersion();
  const createRuntime = useCallback(
    (feature: TextGenerationFeatureId, priority: "interactive" | "background" = "interactive") =>
      createFeatureChatRuntime(
        feature,
        {
          routing,
          providers,
          credentials,
          onLocalUsage: (usage) =>
            store.commit(localModelUsageEvents.localModelUsageRecorded(usage)),
          onCloudUsage: (usage) =>
            store.commit(localModelUsageEvents.cloudModelUsageRecorded(usage)),
        },
        priority,
      ),
    [routing, providers, credentials, store],
  );
  return { routing, providers, credentials, setFeatureModel, createRuntime };
};
