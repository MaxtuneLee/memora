import * as stylex from "@stylexjs/stylex";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  root: { alignItems: "center", color: tokens.textMuted, display: "flex", fontSize: 11, gap: 8 },
  key: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderColor: tokens.border,
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 6,
    color: tokens.textMuted,
    display: "inline-flex",
    fontWeight: 500,
    justifyContent: "center",
    minHeight: 24,
    minWidth: 24,
    paddingInline: 6,
  },
});

export function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <div {...stylex.props(styles.root)}>
      <kbd {...stylex.props(styles.key)}>{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}
