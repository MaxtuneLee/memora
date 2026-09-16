import { useId } from "react";
import * as stylex from "@stylexjs/stylex";

import { NativeDialog } from "@/components/ui/NativeDialog";

const styles = stylex.create({
  panel: {
    backgroundColor: "#fff",
    border: "1px solid #e4e4e7",
    borderRadius: 16,
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    padding: 24,
    width: "min(420px, 92vw)",
  },
  content: { display: "flex", flexDirection: "column", gap: 16 },
  title: { color: "#18181b", fontSize: 18, fontWeight: 600, margin: 0 },
  description: { color: "#71717a", fontSize: 14, marginTop: 4 },
  actions: { alignItems: "center", display: "flex", gap: 8, justifyContent: "flex-end" },
  cancel: {
    border: "1px solid #e4e4e7",
    borderRadius: 8,
    color: "#3f3f46",
    fontSize: 14,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "#fafafa" },
  },
  confirm: {
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
  },
  defaultConfirm: { backgroundColor: "#18181b", ":hover": { backgroundColor: "#27272a" } },
  dangerConfirm: { backgroundColor: "#dc2626", ":hover": { backgroundColor: "#b91c1c" } },
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
