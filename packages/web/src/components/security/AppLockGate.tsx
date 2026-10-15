import { useEffect, useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";

import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import IllustratedCard, {
  illustratedCardSecondaryButtonClassName,
} from "@/components/ui/IllustratedCard";
import {
  forgetPasskey,
  isAppLocked,
  unlockApp,
  useCredentialVaultVersion,
} from "@/lib/settings/credentialVault";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  screen: {
    alignItems: "center",
    backgroundColor: tokens.background,
    display: "flex",
    justifyContent: "center",
    minHeight: "100dvh",
    padding: 16,
  },
});

/** Holds the app behind the passkey, before the workspace starts loading, when the lock is on. */
export default function AppLockGate({ children }: { children: ReactNode }) {
  useCredentialVaultVersion();
  const locked = isAppLocked();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const autoTried = useRef(false);
  const [confirmingForget, setConfirmingForget] = useState(false);

  const unlock = async (silent = false): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await unlockApp();
    } catch (caught) {
      // Browsers that need a click for the passkey reject the automatic attempt; wait for one.
      if (!silent) setError(caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!locked || autoTried.current) return;
    autoTried.current = true;
    void unlock(true);
  }, [locked]);

  if (!locked) return children;

  return (
    <main {...stylex.props(styles.screen)}>
      <IllustratedCard
        imageSrc="/protection.webp"
        title="Memora is locked"
        description="Unlock with your passkey to open your workspace."
        actionLabel={busy ? "Waiting for passkey…" : "Unlock"}
        busy={busy}
        error={error}
        onAction={() => void unlock()}
        secondary={
          <button
            type="button"
            className={illustratedCardSecondaryButtonClassName}
            onClick={() => setConfirmingForget(true)}
          >
            Lost your passkey?
          </button>
        }
      />
      <ConfirmDialog
        isOpen={confirmingForget}
        title="Stop using this passkey?"
        description="Memora won't be locked anymore. If your API keys were encrypted with this passkey, they can't be recovered and you'll need to enter them again in Providers."
        confirmLabel="Stop using passkey"
        tone="danger"
        onConfirm={() => {
          setConfirmingForget(false);
          forgetPasskey();
        }}
        onCancel={() => setConfirmingForget(false)}
      />
    </main>
  );
}
