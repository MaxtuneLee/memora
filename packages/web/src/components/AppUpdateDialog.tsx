import { useEffect, useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useRegisterSW } from "virtual:pwa-register/react";

import { NativeDialog } from "@/components/ui/NativeDialog";
import {
  isReleaseNotesManifest,
  releaseNotesSince,
  type ReleaseNotesManifest,
} from "@/lib/app/releaseNotes";
import { tokens } from "../styles/stylex.stylex";

// Long-lived tabs rarely navigate, and the browser only checks for a new service worker on
// navigation, so also check on a timer.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Same ring as ConfirmDialog: tokens.focusRing is too faint on the dialog surface in dark mode.
const FOCUS_RING = `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.textStrong}`;

const styles = stylex.create({
  panel: {
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 16,
    boxShadow: tokens.shadowLarge,
    padding: 24,
    width: "min(460px, 92vw)",
  },
  content: { display: "flex", flexDirection: "column", gap: 16 },
  title: { color: tokens.textStrong, fontSize: 18, fontWeight: 600, margin: 0 },
  description: { color: tokens.textMuted, fontSize: 14, marginTop: 4 },
  notes: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: "min(320px, 50vh)",
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
  actions: { alignItems: "center", display: "flex", gap: 8, justifyContent: "flex-end" },
  later: {
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    color: tokens.text,
    fontSize: 14,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: tokens.hoverStrong },
    ":focus-visible": { boxShadow: FOCUS_RING, outline: "none" },
  },
  reload: {
    backgroundColor: tokens.primaryBackground,
    borderRadius: 8,
    color: tokens.primaryText,
    fontSize: 14,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
    },
    ":focus-visible": { boxShadow: FOCUS_RING, outline: "none" },
  },
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
  const descriptionId = useId();
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

  return (
    <NativeDialog
      open={needRefresh}
      onOpenChange={setNeedRefresh}
      labelledBy={titleId}
      describedBy={descriptionId}
      panelClassName={stylex.props(styles.panel).className}
    >
      <div {...stylex.props(styles.content)}>
        <div>
          <h2 id={titleId} {...stylex.props(styles.title)}>
            A new version of Memora is ready
          </h2>
          <p id={descriptionId} {...stylex.props(styles.description)}>
            Reload to start using it. Your files and chats stay on this device.
          </p>
        </div>
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
        <div {...stylex.props(styles.actions)}>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            {...stylex.props(styles.later)}
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => void updateServiceWorker()}
            {...stylex.props(styles.reload)}
          >
            Reload
          </button>
        </div>
      </div>
    </NativeDialog>
  );
}
