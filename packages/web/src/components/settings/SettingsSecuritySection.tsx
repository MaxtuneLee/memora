import { Toast } from "@base-ui/react/toast";
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Switch } from "@/components/ui/Switch";
import {
  readVaultConfig,
  setAppLock,
  setKeyEncryption,
  useCredentialVaultVersion,
} from "@/lib/settings/credentialVault";
import {
  providerCredentialEvents,
  providerCredentialsQuery$,
} from "@/livestore/providerCredential";
import { useAppStore } from "@/livestore/store";

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 16 },
  heading: { display: "flex", flexDirection: "column", gap: 8 },
  rows: { display: "flex", flexDirection: "column", gap: 12, marginTop: 20 },
  row: { alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" },
  rowText: { display: "flex", flexDirection: "column", gap: 4 },
});

type Busy = "keys" | "lock" | null;

export default function SettingsSecuritySection() {
  const store = useAppStore();
  const { add } = Toast.useToastManager();
  useCredentialVaultVersion();
  const { encryptKeys, lockApp } = readVaultConfig();
  const [busy, setBusy] = useState<Busy>(null);

  const run = async (
    which: Exclude<Busy, null>,
    action: () => Promise<void>,
    success: string,
    failure: string,
  ): Promise<void> => {
    setBusy(which);
    try {
      await action();
      add({ title: success, type: "success" });
    } catch (error) {
      add({
        title: failure,
        description: error instanceof Error ? error.message : "Please try again.",
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleKeysChange = (checked: boolean) =>
    run(
      "keys",
      async () => {
        const credentials = store.query(providerCredentialsQuery$);
        const resealed = await setKeyEncryption(checked, credentials);
        if (resealed.length === 0) return;
        store.commit(
          ...resealed.map((row) =>
            providerCredentialEvents.providerCredentialSet({
              providerId: row.providerId,
              baseUrl:
                credentials.find((entry) => entry.providerId === row.providerId)?.baseUrl ?? "",
              apiKey: row.apiKey,
            }),
          ),
        );
      },
      checked
        ? "API keys are now encrypted with your passkey"
        : "API keys are now encrypted with this browser's key",
      "Couldn't change how API keys are encrypted",
    );

  const handleLockChange = (checked: boolean) =>
    run(
      "lock",
      () => setAppLock(checked),
      checked
        ? "Memora will ask for your passkey when it opens"
        : "Memora won't be locked when it opens",
      checked ? "Couldn't turn on the lock" : "Couldn't turn off the lock",
    );

  return (
    <div {...stylex.props(styles.stack)}>
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.heading)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Passkey</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Use Touch ID, Face ID, Windows Hello, or a security key. Both options share one passkey,
            so when both are on you only unlock once. If you lose the passkey, you'll need to enter
            your API keys again.
          </p>
        </div>
        <div {...stylex.props(styles.rows)}>
          <div className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}>
            <span {...stylex.props(styles.rowText)}>
              <span className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
                Encrypt API keys with a passkey
              </span>
              <span className={SETTINGS_SECTION_BODY_CLASS_NAME}>
                {encryptKeys
                  ? "Your keys can't be read from this browser's files without the passkey. Memora asks for it the first time a key is needed."
                  : "Your keys are encrypted with a key stored in this browser. Someone with a copy of this browser's files could still decrypt them."}
              </span>
            </span>
            <Switch
              checked={encryptKeys}
              disabled={busy !== null}
              aria-label="Encrypt API keys with a passkey"
              onCheckedChange={(checked) => void handleKeysChange(checked)}
            />
          </div>
          <div className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}>
            <span {...stylex.props(styles.rowText)}>
              <span className={SETTINGS_FIELD_LABEL_CLASS_NAME}>Lock Memora when it opens</span>
              <span className={SETTINGS_SECTION_BODY_CLASS_NAME}>
                Ask for your passkey before your workspace appears. This keeps others using this
                browser out of Memora; your files on disk aren't encrypted.
              </span>
            </span>
            <Switch
              checked={lockApp}
              disabled={busy !== null}
              aria-label="Lock Memora when it opens"
              onCheckedChange={(checked) => void handleLockChange(checked)}
            />
          </div>
        </div>
      </section>
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.heading)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Keys saved before encryption</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            API keys saved by earlier versions of Memora may still be readable in older local data.
            To be safe, create new keys with your provider and enter them in Providers.
          </p>
        </div>
      </section>
    </div>
  );
}
