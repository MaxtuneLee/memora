import { useAppStore } from "@/livestore/store";
import { useCallback } from "react";

import { useCredentialVaultVersion } from "@/lib/settings/credentialVault";
import type { provider } from "@/livestore/provider";
import { providerCredentialsQuery$, readProviderApiKey } from "@/livestore/providerCredential";

export const useProviderCredentials = () => {
  const store = useAppStore();
  const credentials = store.useQuery(providerCredentialsQuery$);
  const vaultVersion = useCredentialVaultVersion();
  return useCallback(
    (provider: Pick<provider, "id" | "baseUrl">): string =>
      vaultVersion >= 0 ? readProviderApiKey(provider, credentials) : "",
    [credentials, vaultVersion],
  );
};
