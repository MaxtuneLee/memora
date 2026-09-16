import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  root: { alignItems: "center", color: "#71717a", display: "flex", fontSize: 11, gap: 8 },
  key: {
    alignItems: "center",
    backgroundColor: "#f7f4ef",
    border: "1px solid #e5e0d8",
    borderRadius: 6,
    color: "#71717a",
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
