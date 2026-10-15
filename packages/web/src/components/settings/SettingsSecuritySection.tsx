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
import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  forgetPasskey,
  isPasskeySealed,
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
  heading: { display: "flex", flexDirection: "column", gap: 8 },
  rows: { display: "flex", flexDirection: "column", gap: 12, marginTop: 20 },
  row: { alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" },
});

type Busy = "keys" | "lock" | null;

export default function SettingsSecuritySection() {
  const store = useAppStore();
  const { add } = Toast.useToastManager();
  useCredentialVaultVersion();
  const credentials = store.useQuery(providerCredentialsQuery$);
  const { passkey, encryptKeys, lockApp } = readVaultConfig();
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  // Also offered when keys were sealed by a passkey this browser no longer has settings for.
  const canReset = passkey !== null || credentials.some((row) => isPasskeySealed(row.apiKey));

  const handleReset = (): void => {
    setConfirmingReset(false);
    const keyed = credentials.filter((row) => row.apiKey);
    if (keyed.length > 0) {
      store.commit(
        ...keyed.map((row) =>
          providerCredentialEvents.providerCredentialDeletedHere({ providerId: row.providerId }),
        ),
      );
    }
    forgetPasskey();
    add({
      title: "Passkey removed",
      description: "Enter your API keys again in Providers.",
      type: "success",
    });
  };

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
    <section className={SETTINGS_PANEL_CLASS_NAME}>
      <div {...stylex.props(styles.heading)}>
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Passkey</h3>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          Use Touch ID, Face ID, Windows Hello, or a security key. If you lose the passkey, you'll
          need to enter your API keys again.
        </p>
      </div>
      <div {...stylex.props(styles.rows)}>
        <div className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}>
          <span className={SETTINGS_FIELD_LABEL_CLASS_NAME}>Encrypt API keys with a passkey</span>
          <Switch
            checked={encryptKeys}
            disabled={busy !== null}
            aria-label="Encrypt API keys with a passkey"
            onCheckedChange={(checked) => void handleKeysChange(checked)}
          />
        </div>
        <div className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}>
          <span className={SETTINGS_FIELD_LABEL_CLASS_NAME}>Lock Memora when it opens</span>
          <Switch
            checked={lockApp}
            disabled={busy !== null}
            aria-label="Lock Memora when it opens"
            onCheckedChange={(checked) => void handleLockChange(checked)}
          />
        </div>
        {canReset && (
          <div className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}>
            <span className={SETTINGS_FIELD_LABEL_CLASS_NAME}>Lost your passkey?</span>
            <Button
              variant="destructive"
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirmingReset(true)}
            >
              Remove passkey
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirmingReset}
        title="Remove your passkey?"
        description="This deletes the API keys of every provider and turns off passkey encryption and the lock. You'll need to enter the keys again in Providers. This can't be undone."
        confirmLabel="Remove passkey and keys"
        tone="danger"
        onConfirm={handleReset}
        onCancel={() => setConfirmingReset(false)}
      />
    </section>
  );
}
