import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import IllustratedCard, {
  illustratedCardSecondaryButtonClassName,
} from "@/components/ui/IllustratedCard";
import {
  canSealSilently,
  decryptCredentials,
  isPasskeyLocked,
  isSealedApiKey,
  readVaultConfig,
  sealApiKey,
  unlockWithPasskey,
  useCredentialVaultVersion,
} from "@/lib/settings/credentialVault";
import {
  providerCredentialEvents,
  providerCredentialsQuery$,
} from "@/livestore/providerCredential";
import { useAppStore } from "@/livestore/store";

const styles = stylex.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "color-mix(in srgb, black 40%, transparent)",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: 16,
    position: "fixed",
    zIndex: 60,
  },
});

/**
 * Keeps stored API keys encrypted: decrypts them for this session, encrypts keys saved before
 * encryption, and asks for the passkey when keys it sealed have no saved passkey setting.
 */
export default function CredentialVaultPrompt() {
  const store = useAppStore();
  const credentials = store.useQuery(providerCredentialsQuery$);
  useCredentialVaultVersion();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const migrating = useRef(new Set<string>());

  useEffect(() => {
    void decryptCredentials(credentials);
  }, [credentials]);

  // Encrypt keys saved before encryption existed, but never ask for the passkey just for that.
  useEffect(() => {
    if (!canSealSilently()) return;
    for (const row of credentials) {
      if (!row.apiKey || isSealedApiKey(row.apiKey) || migrating.current.has(row.apiKey)) continue;
      migrating.current.add(row.apiKey);
      void sealApiKey(row.apiKey).then((apiKey) =>
        store.commit(providerCredentialEvents.providerCredentialSet({ ...row, apiKey })),
      );
    }
  }, [credentials, store]);

  const lockedRows = credentials.filter((row) => isPasskeyLocked(row.apiKey));
  // With a saved passkey, locked keys are unlocked when they are needed. Without one (the
  // setting was lost), ask here so the passkey gets saved again.
  if (dismissed || lockedRows.length === 0 || readVaultConfig().passkey) return null;

  const unlock = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await unlockWithPasskey(credentials);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div {...stylex.props(styles.overlay)}>
      <IllustratedCard
        imageSrc="/protection.webp"
        title="Your API keys are locked"
        description="They were encrypted with a passkey. Unlock them to use cloud models."
        actionLabel={busy ? "Waiting for passkey…" : "Unlock"}
        busy={busy}
        error={error}
        onAction={() => void unlock()}
        secondary={
          <>
            <button
              type="button"
              className={illustratedCardSecondaryButtonClassName}
              onClick={() => setConfirmingRemove(true)}
            >
              I lost my passkey
            </button>
            <button
              type="button"
              className={illustratedCardSecondaryButtonClassName}
              onClick={() => setDismissed(true)}
            >
              Not now
            </button>
          </>
        }
      />
      <ConfirmDialog
        isOpen={confirmingRemove}
        title={
          lockedRows.length === 1 ? "Remove this API key?" : `Remove ${lockedRows.length} API keys?`
        }
        description="They were encrypted with a passkey that isn't available. You'll need to enter them again in Providers. This can't be undone."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          setConfirmingRemove(false);
          store.commit(
            ...lockedRows.map((row) =>
              providerCredentialEvents.providerCredentialDeleted({ providerId: row.providerId }),
            ),
          );
        }}
        onCancel={() => setConfirmingRemove(false)}
      />
    </div>
  );
}
