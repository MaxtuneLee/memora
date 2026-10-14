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
  disablePasskey,
  enablePasskey,
  readVaultConfig,
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
  row: {
    alignItems: "center",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    marginTop: 20,
  },
  rowText: { display: "flex", flexDirection: "column", gap: 4 },
});

export default function SettingsSecuritySection() {
  const store = useAppStore();
  const { add } = Toast.useToastManager();
  useCredentialVaultVersion();
  const passkeyOn = readVaultConfig().mode === "passkey";
  const [busy, setBusy] = useState(false);

  const handleChange = async (checked: boolean): Promise<void> => {
    setBusy(true);
    try {
      const credentials = store.query(providerCredentialsQuery$);
      const resealed = checked
        ? await enablePasskey(credentials)
        : await disablePasskey(credentials);
      if (resealed.length > 0) {
        store.commit(
          ...resealed.map((row) => {
            const current = credentials.find((entry) => entry.providerId === row.providerId);
            return providerCredentialEvents.providerCredentialSet({
              providerId: row.providerId,
              baseUrl: current?.baseUrl ?? "",
              apiKey: row.apiKey,
            });
          }),
        );
      }
      add({
        title: checked ? "Passkey lock is on" : "Passkey lock is off",
        description: checked
          ? "Memora will ask for your passkey when it opens."
          : "Your API keys are now encrypted with a key stored in this browser.",
        type: "success",
      });
    } catch (error) {
      add({
        title: checked ? "Couldn't turn on the passkey lock" : "Couldn't turn off the passkey lock",
        description: error instanceof Error ? error.message : "Please try again.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div {...stylex.props(styles.stack)}>
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.heading)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>API key protection</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            {passkeyOn
              ? "Your API keys are encrypted with your passkey, so they can't be read from this browser's files. Memora asks for the passkey each time it opens."
              : "Your API keys are encrypted with a key stored in this browser. This keeps them out of Memora's data files, but someone with a copy of this browser's files could still decrypt them."}
          </p>
        </div>
        <div className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}>
          <span {...stylex.props(styles.rowText)}>
            <span className={SETTINGS_FIELD_LABEL_CLASS_NAME}>Lock Memora with a passkey</span>
            <span className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              Unlock with Touch ID, Face ID, Windows Hello, or a security key. If you lose the
              passkey, you'll need to enter your API keys again.
            </span>
          </span>
          <Switch
            checked={passkeyOn}
            disabled={busy}
            aria-label="Lock Memora with a passkey"
            onCheckedChange={(checked) => void handleChange(checked)}
          />
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
