import type { CSSProperties } from "react";
import { Button } from "@base-ui/react/button";
import { PencilSimpleIcon, SpinnerGapIcon, SubtitlesIcon, TrashIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";

import type { RecordingItem } from "@/types/library";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
  header: { paddingTop: "1rem" },
  layout: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    "@media (min-width: 1280px)": {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  titleArea: { minWidth: 0 },
  savedAt: { color: "var(--color-memora-text-soft)", fontSize: 11, lineHeight: "1rem" },
  titleFrame: { marginTop: "0.375rem" },
  renameForm: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    "@media (min-width: 640px)": { alignItems: "flex-end", flexDirection: "row" },
  },
  renameInput: {
    backgroundColor: "transparent",
    color: "var(--color-memora-text-strong)",
    flex: 1,
    fontFamily: "var(--font-serif)",
    fontSize: "clamp(1.3rem, 2.8vw, 2rem)",
    fontWeight: 600,
    letterSpacing: "-0.035em",
    lineHeight: 0.98,
    minWidth: 0,
    paddingBlock: "0.5rem",
    paddingInline: 0,
    ":focus": { outline: "none" },
  },
  renameActions: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem" },
  textAction: {
    backgroundColor: "transparent",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: 0,
    transitionDuration: "150ms",
    transitionProperty: "color",
  },
  saveAction: {
    color: { default: "var(--color-memora-text)", ":hover": "var(--color-memora-text-strong)" },
  },
  cancelAction: {
    color: { default: "var(--color-memora-text-muted)", ":hover": "var(--color-memora-text)" },
  },
  titleButton: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    maxWidth: "56rem",
    textAlign: "left",
  },
  title: {
    color: {
      default: "var(--color-memora-text-strong)",
      ":hover":
        "color-mix(in srgb, var(--color-memora-text-strong) 86%, var(--color-memora-olive) 14%)",
    },
    fontFamily: "var(--font-serif)",
    fontSize: "clamp(1.35rem, 2.6vw, 2rem)",
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: 1,
    overflowWrap: "break-word",
    transitionDuration: "300ms",
    transitionProperty: "color",
    transitionTimingFunction: "var(--ease-out-quart)",
  },
  pencil: {
    color: "var(--color-memora-text-soft)",
    flexShrink: 0,
    height: "1rem",
    marginTop: "0.375rem",
    transitionDuration: "300ms",
    transitionProperty: "color, transform",
    transitionTimingFunction: "var(--ease-out-quart)",
    width: "1rem",
  },
  meta: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  actions: {
    alignItems: "center",
    columnGap: "1rem",
    display: "flex",
    flexWrap: "wrap",
    rowGap: "0.5rem",
  },
  action: {
    alignItems: "center",
    backgroundColor: "transparent",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: "1.25rem",
    minHeight: "2.5rem",
    paddingInline: 0,
    transitionDuration: "150ms",
    transitionProperty: "color, opacity",
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  activeTranscript: { color: "var(--color-memora-text-strong)" },
  inactiveTranscript: {
    color: { default: "var(--color-memora-text-muted)", ":hover": "var(--color-memora-text)" },
  },
  deleteAction: { color: "var(--color-memora-warning-text)", ":hover": { opacity: 0.8 } },
  icon: {
    height: "1rem",
    transitionDuration: "300ms",
    transitionProperty: "transform",
    transitionTimingFunction: "var(--ease-out-quart)",
    width: "1rem",
  },
  spinner: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
});

interface RecordingHeaderProps {
  recording: RecordingItem;
  isRenaming: boolean;
  renameValue: string;
  metaPills: readonly string[];
  isMedia: boolean;
  showTranscript: boolean;
  hasTranscript: boolean;
  isTranscribing: boolean;
  createdAtLabel: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
  onToggleTranscript: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}

export const RecordingHeader = ({
  recording,
  isRenaming,
  renameValue,
  metaPills,
  isMedia,
  showTranscript,
  hasTranscript,
  isTranscribing,
  createdAtLabel,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onStartRename,
  onToggleTranscript,
  onDelete,
}: RecordingHeaderProps) => {
  const metaLine = metaPills.join(" \u00b7 ");

  return (
    <header
      data-surface="transcript-detail-header"
      className={`memora-motion-enter ${stylex.props(styles.header).className ?? ""}`}
      style={{ "--enter-delay": "40ms" } as CSSProperties}
    >
      <div {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.titleArea)}>
          <p {...stylex.props(styles.savedAt)}>Saved {createdAtLabel}</p>

          <div {...stylex.props(styles.titleFrame)}>
            {isRenaming ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onRenameSubmit();
                }}
                {...stylex.props(styles.renameForm)}
              >
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => onRenameChange(event.target.value)}
                  {...stylex.props(styles.renameInput)}
                  autoFocus
                />
                <div {...stylex.props(styles.renameActions)}>
                  <Button
                    type="submit"
                    className={`memora-interactive ${stylex.props(styles.textAction, styles.saveAction).className ?? ""}`}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    onClick={onRenameCancel}
                    className={`memora-interactive ${stylex.props(styles.textAction, styles.cancelAction).className ?? ""}`}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <button onClick={onStartRename} {...stylex.props(styles.titleButton)}>
                <h1 {...stylex.props(styles.title)}>{recording.name}</h1>
                <PencilSimpleIcon {...stylex.props(styles.pencil)} />
              </button>
            )}
          </div>

          <p {...stylex.props(styles.meta)}>{metaLine}</p>
        </div>

        <div {...stylex.props(styles.actions)}>
          {isMedia ? (
            <Button
              onClick={onToggleTranscript}
              disabled={isTranscribing}
              className={`memora-interactive ${stylex.props(styles.action, showTranscript ? styles.activeTranscript : styles.inactiveTranscript).className ?? ""}`}
              title={showTranscript ? "Hide transcript" : "Show transcript"}
            >
              {isTranscribing ? (
                <SpinnerGapIcon {...stylex.props(styles.icon, styles.spinner)} />
              ) : (
                <SubtitlesIcon
                  {...stylex.props(styles.icon)}
                  weight={showTranscript ? "fill" : "bold"}
                />
              )}
              <span>
                {showTranscript
                  ? "Hide transcript"
                  : hasTranscript
                    ? "Show transcript"
                    : "Generate transcript"}
              </span>
            </Button>
          ) : null}

          <Button
            onClick={onDelete}
            className={`memora-interactive ${stylex.props(styles.action, styles.deleteAction).className ?? ""}`}
            title="Delete recording"
          >
            <TrashIcon {...stylex.props(styles.icon)} weight="bold" />
            <span>Delete</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
