import { useAppStore } from "@/livestore/store";
import { useCallback, useEffect, useState } from "react";

import { parseProviderModels } from "@/lib/settings/dialogHelpers";
import { fetchProviderModels } from "@/lib/settings/providerModels";
import { settingsProvidersQuery$ } from "@/lib/settings/queries";
import { providerEvents, type provider as ProviderRow } from "@/livestore/provider";
import { providerCredentialsQuery$, readProviderApiKey } from "@/livestore/providerCredential";
import type { ModelInfo } from "@/types/settingsDialog";

interface CatalogState {
  requestKey: string;
  loading: boolean;
  error: string | null;
  models?: ModelInfo[];
}

export const useProviderModelCatalog = (provider: ProviderRow | undefined, apiKey: string) => {
  const store = useAppStore();
  const providerId = provider?.id ?? "";
  const baseUrl = provider?.baseUrl ?? "";
  const requestKey = JSON.stringify([providerId, baseUrl, apiKey]);
  const [state, setState] = useState<CatalogState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!providerId || !baseUrl) return;
    let active = true;
    setState({ requestKey, loading: true, error: null });
    void fetchProviderModels(baseUrl, apiKey)
      .then((models) => {
        if (!active) return;
        // Recheck the current endpoint and device credential before storing metadata.
        const current = store
          .query(settingsProvidersQuery$)
          .find((entry) => entry.id === providerId);
        if (
          !current ||
          current.baseUrl !== baseUrl ||
          readProviderApiKey(current, store.query(providerCredentialsQuery$)) !== apiKey
        )
          return;
        const serialized = JSON.stringify(models);
        if (current.models !== serialized) {
          store.commit(
            providerEvents.providerUpdated({
              id: providerId,
              models: serialized,
              updatedAt: new Date(),
            }),
          );
        }
        setState({ requestKey, loading: false, error: null, models });
      })
      .catch(() => {
        if (active)
          setState({
            requestKey,
            loading: false,
            error: "Could not load models. Check the provider settings and try again.",
          });
      });
    return () => {
      active = false;
    };
  }, [apiKey, attempt, baseUrl, providerId, requestKey, store]);

  const current = state?.requestKey === requestKey ? state : null;
  return {
    models: current?.models ?? (provider ? parseProviderModels(provider) : []),
    loading: !!providerId && !!baseUrl && (current?.loading ?? true),
    error: current?.error ?? null,
    reload,
  };
};
