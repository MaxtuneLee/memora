import { useEffect, useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  decryptCredentials,
  isSealedApiKey,
  readCredentialVaultState,
  sealApiKey,
  unlockCredentials,
  useCredentialVaultVersion,
} from "@/lib/settings/credentialVault";
import {
  providerCredentialEvents,
  providerCredentialsQuery$,
} from "@/livestore/providerCredential";
import { useAppStore } from "@/livestore/store";
import { tokens } from "../styles/stylex.stylex";

const FOCUS_RING = `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.textStrong}`;

const styles = stylex.create({
  card: {
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    bottom: 16,
    boxShadow: tokens.shadowLarge,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxWidth: "calc(100vw - 32px)",
    padding: 16,
    position: "fixed",
    right: 16,
    width: 340,
    zIndex: 50,
  },
  title: { color: tokens.textStrong, fontSize: 14, fontWeight: 600, margin: 0 },
  description: { color: tokens.textMuted, fontSize: 13, lineHeight: 1.5, margin: 0, marginTop: 4 },
  error: { color: tokens.textStrong, fontSize: 13, margin: 0 },
  actions: { display: "flex", gap: 8, justifyContent: "flex-end" },
  secondary: {
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    color: tokens.text,
    fontSize: 13,
    paddingBlock: 5,
    paddingInline: 10,
    ":hover": { backgroundColor: tokens.hoverStrong },
    ":focus-visible": { boxShadow: FOCUS_RING, outline: "none" },
  },
  primary: {
    backgroundColor: tokens.primaryBackground,
    borderRadius: 8,
    color: tokens.primaryText,
    fontSize: 13,
    paddingBlock: 5,
    paddingInline: 10,
    ":disabled": { opacity: 0.6 },
    ":focus-visible": { boxShadow: FOCUS_RING, outline: "none" },
  },
});

/** Unlocks passkey-encrypted API keys, and offers to encrypt keys saved before encryption. */
export default function CredentialVaultPrompt() {
  const store = useAppStore();
  const credentials = store.useQuery(providerCredentialsQuery$);
  useCredentialVaultVersion();
  const titleId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void decryptCredentials(credentials);
  }, [credentials]);

  const { locked, plaintext } = readCredentialVaultState(credentials);
  if (dismissed || (!locked && !plaintext)) return null;

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      if (locked) {
        await unlockCredentials(credentials);
      } else {
        const unsealed = credentials.filter((row) => row.apiKey && !isSealedApiKey(row.apiKey));
        for (const row of unsealed) {
          store.commit(
            providerCredentialEvents.providerCredentialSet({
              ...row,
              apiKey: await sealApiKey(row.apiKey, credentials),
            }),
          );
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={titleId} {...stylex.props(styles.card)}>
      <div>
        <h2 id={titleId} {...stylex.props(styles.title)}>
          {locked ? "Your API keys are locked" : "Encrypt your API keys"}
        </h2>
        <p {...stylex.props(styles.description)}>
          {locked
            ? "Unlock them with your passkey to use cloud models."
            : "Your API keys are saved unencrypted on this device. Encrypt them with a passkey so they can't be read from disk."}
        </p>
      </div>
      {error && <p {...stylex.props(styles.error)}>{error}</p>}
      <div {...stylex.props(styles.actions)}>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          {...stylex.props(styles.secondary)}
        >
          Later
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          {...stylex.props(styles.primary)}
        >
          {locked ? "Unlock" : "Encrypt"}
        </button>
      </div>
    </section>
  );
}
