import { useEffect, useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useRegisterSW } from "virtual:pwa-register/react";

import IllustratedCard, {
  illustratedCardPanelStyle,
  illustratedCardSecondaryButtonClassName,
} from "@/components/ui/IllustratedCard";
import { NativeDialog } from "@/components/ui/NativeDialog";
import { SHOW_APP_UPDATE_EVENT } from "@/lib/app/appUpdate";
import {
  isReleaseNotesManifest,
  releaseNotesSince,
  type ReleaseNotesManifest,
} from "@/lib/app/releaseNotes";
import { tokens } from "../styles/stylex.stylex";

// Long-lived tabs rarely navigate, and the browser only checks for a new service worker on
// navigation, so also check on a timer.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const styles = stylex.create({
  notes: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: "min(240px, 40vh)",
    overflowY: "auto",
  },
  release: { display: "flex", flexDirection: "column", gap: 6 },
  releaseId: { color: tokens.textSoft, fontSize: 12, margin: 0 },
  items: {
    color: tokens.text,
    display: "flex",
    flexDirection: "column",
    fontSize: 14,
    gap: 4,
    lineHeight: 1.5,
    listStyleType: "disc",
    margin: 0,
    paddingInlineStart: 20,
  },
  version: { color: tokens.textSoft, fontSize: 12, margin: 0 },
});

const fetchReleaseNotes = async (): Promise<ReleaseNotesManifest | null> => {
  try {
    // Served from the new deployment, not the service worker cache.
    const response = await fetch("/release-notes.json", { cache: "no-store" });
    if (!response.ok) return null;
    const manifest: unknown = await response.json();
    return isReleaseNotesManifest(manifest) ? manifest : null;
  } catch {
    return null;
  }
};

export default function AppUpdateDialog() {
  const titleId = useId();
  const [reloading, setReloading] = useState(false);
  const [release, setRelease] = useState<ReleaseNotesManifest | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // ponytail: registered once per page load, so the timer is never cleared.
      setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    const show = () => setNeedRefresh(true);
    window.addEventListener(SHOW_APP_UPDATE_EVENT, show);
    return () => window.removeEventListener(SHOW_APP_UPDATE_EVENT, show);
  }, [setNeedRefresh]);

  useEffect(() => {
    if (!needRefresh) return;
    let cancelled = false;
    void fetchReleaseNotes().then((manifest) => {
      if (!cancelled) setRelease(manifest);
    });
    return () => {
      cancelled = true;
    };
  }, [needRefresh]);

  const notes = release ? releaseNotesSince(release.notes, __RELEASE_NOTE_ID__) : [];

  const reload = async (): Promise<void> => {
    setReloading(true);
    try {
      await updateServiceWorker();
    } finally {
      setReloading(false);
    }
  };

  return (
    <NativeDialog
      open={needRefresh}
      onOpenChange={setNeedRefresh}
      labelledBy={titleId}
      // The card brings its own surface; inline style wins over the dialog panel's CSS.
      panelStyle={illustratedCardPanelStyle}
    >
      <IllustratedCard
        imageSrc="/update.webp"
        titleId={titleId}
        title="A new version of Memora is ready"
        description="Reload to start using it."
        actionLabel={reloading ? "Reloading…" : "Reload"}
        busy={reloading}
        onAction={() => void reload()}
        secondary={
          <button
            type="button"
            className={illustratedCardSecondaryButtonClassName}
            onClick={() => setNeedRefresh(false)}
          >
            Later
          </button>
        }
      >
        {notes.length > 0 && (
          <div {...stylex.props(styles.notes)}>
            {notes.map((note) => (
              <section key={note.id} {...stylex.props(styles.release)}>
                <h3 {...stylex.props(styles.releaseId)}>{note.id}</h3>
                <ul {...stylex.props(styles.items)}>
                  {note.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {release && <p {...stylex.props(styles.version)}>Version {release.version}</p>}
      </IllustratedCard>
    </NativeDialog>
  );
}
