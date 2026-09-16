import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  panel: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 20,
    padding: 20,
    "@media (min-width: 40rem)": { paddingInline: 24 },
  },
  insetPanel: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRadius: 16,
    padding: 16,
  },
  row: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRadius: 16,
    paddingBlock: 12,
    paddingInline: 16,
  },
  sectionTitle: {
    color: "var(--color-memora-text-strong)",
    fontFamily: "var(--font-serif)",
    fontSize: "0.95rem",
    fontWeight: 600,
  },
  sectionBody: { color: "var(--color-memora-text-muted)", fontSize: 14, lineHeight: "24px" },
  fieldLabel: { color: "var(--color-memora-text-muted)", fontSize: 14, fontWeight: 500 },
});

export const SETTINGS_PANEL_CLASS_NAME = stylex.props(styles.panel).className;
export const SETTINGS_INSET_PANEL_CLASS_NAME = stylex.props(styles.insetPanel).className;
export const SETTINGS_ROW_CLASS_NAME = stylex.props(styles.row).className;
export const SETTINGS_SECTION_TITLE_CLASS_NAME = stylex.props(styles.sectionTitle).className;
export const SETTINGS_SECTION_BODY_CLASS_NAME = stylex.props(styles.sectionBody).className;
export const SETTINGS_FIELD_LABEL_CLASS_NAME = stylex.props(styles.fieldLabel).className;
