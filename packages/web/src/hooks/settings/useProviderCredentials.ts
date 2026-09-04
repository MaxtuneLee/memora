import { useAppStore } from "@/livestore/store";
import { useCallback } from "react";

import type { provider } from "@/livestore/provider";
import { providerCredentialsQuery$, readProviderApiKey } from "@/livestore/providerCredential";

export const useProviderCredentials = () => {
  const store = useAppStore();
  const credentials = store.useQuery(providerCredentialsQuery$);
  return useCallback(
    (provider: Pick<provider, "id" | "baseUrl">): string =>
      readProviderApiKey(provider, credentials),
    [credentials],
  );
};
