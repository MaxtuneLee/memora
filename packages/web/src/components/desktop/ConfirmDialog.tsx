import { useId } from "react";
import * as stylex from "@stylexjs/stylex";

import { NativeDialog } from "@/components/ui/NativeDialog";
import { tokens } from "../../styles/stylex.stylex";

// The dialog panel itself is tokens.surface, so a plain tokens.focusRing ring (tuned against
// tokens.background) falls just under the WCAG 3:1 non-text contrast minimum in dark mode.
// textStrong flips near-black/near-white per theme, so it stays clearly legible on the panel.
const FOCUS_RING = `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.textStrong}`;

const styles = stylex.create({
  panel: {
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 16,
    boxShadow: tokens.shadowLarge,
    padding: 24,
    width: "min(420px, 92vw)",
  },
  content: { display: "flex", flexDirection: "column", gap: 16 },
  title: { color: tokens.textStrong, fontSize: 18, fontWeight: 600, margin: 0 },
  description: { color: tokens.textMuted, fontSize: 14, marginTop: 4 },
  actions: { alignItems: "center", display: "flex", gap: 8, justifyContent: "flex-end" },
  cancel: {
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
  confirm: {
    borderRadius: 8,
    fontSize: 14,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":focus-visible": { boxShadow: FOCUS_RING, outline: "none" },
  },
  defaultConfirm: {
    backgroundColor: tokens.primaryBackground,
    color: tokens.primaryText,
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
    },
  },
  dangerConfirm: {
    backgroundColor: tokens.dangerText,
    color: tokens.textInverse,
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.dangerText} 86%, ${tokens.surface})`,
    },
  },
});

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "default" | "danger";
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  tone = "default",
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <NativeDialog
      open={isOpen}
      onOpenChange={(open) => !open && onCancel()}
      labelledBy={titleId}
      describedBy={descriptionId}
      panelClassName={stylex.props(styles.panel).className}
    >
      <div {...stylex.props(styles.content)}>
        <div>
          <h2 id={titleId} {...stylex.props(styles.title)}>
            {title}
          </h2>
          <p id={descriptionId} {...stylex.props(styles.description)}>
            {description}
          </p>
        </div>
        <div {...stylex.props(styles.actions)}>
          <button type="button" {...stylex.props(styles.cancel)} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            {...stylex.props(
              styles.confirm,
              tone === "danger" ? styles.dangerConfirm : styles.defaultConfirm,
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </NativeDialog>
  );
}
