import { GearSixIcon, PlusIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { useMemo, type ReactNode } from "react";
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import { AudioVisualizer } from "@/components/transcript/AudioVisualizer";
import { LanguageSelector } from "@/components/transcript/LanguageSelector";
import type { SettingsSectionId } from "@/types/settings";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { BackButton } from "@/components/transcript/BackButton";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "1.5rem" },
  topRow: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    "@media (min-width: 768px)": {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  panel: {
    backgroundColor: "white",
    borderColor: "#e4e4e7",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    padding: "1rem",
  },
  panelRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  actions: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: { default: "#18181b", ":hover": "#27272a" },
    borderRadius: "9999px",
    boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    color: "white",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: "1rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: { default: "white", ":hover": "#fafafa" },
    borderColor: "#e4e4e7",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    color: "#3f3f46",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color",
  },
  icon: { height: "1rem", width: "1rem" },
  menu: {
    backgroundColor: "white",
    borderRadius: "0.75rem",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    minWidth: 220,
  },
  languageSection: {
    borderRadius: "0.5rem",
    color: "#3f3f46",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  languageControl: { marginTop: "0.5rem" },
  separator: { backgroundColor: "#f4f4f5", height: 1, marginBlock: "0.5rem" },
  menuItem: {
    alignItems: "center",
    color: { default: "#3f3f46", "[data-highlighted]": "#18181b" },
    borderRadius: "0.5rem",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    justifyContent: "space-between",
    lineHeight: "1.25rem",
    outline: "none",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color",
    "[data-highlighted]": { backgroundColor: "#f4f4f5" },
  },
  menuIcon: { alignSelf: "center", color: "#a1a1aa", flexShrink: 0, height: "1rem", width: "1rem" },
  visualizer: { flex: 1, height: "1.5rem", maxWidth: "100%" },
  badge: {
    alignItems: "center",
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.5rem",
    lineHeight: "1rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.75rem",
  },
  statusDot: { borderRadius: "9999px", height: "0.5rem", width: "0.5rem" },
  statusSuccess: { backgroundColor: "#34d399" },
  statusWarning: { backgroundColor: "#fbbf24" },
  statusNeutral: { backgroundColor: "#a1a1aa" },
});

interface TranscriptionHeaderProps {
  stream: MediaStream | null;
  language: string;
  onLanguageChange: (language: string) => void;
  actions: ReactNode;
  onCreateNew: () => void;
  hideCreateNew?: boolean;
  modelBadge: {
    label: string;
    tone: "success" | "warning" | "neutral";
  };
}

export const TranscriptionHeader = ({
  stream,
  language,
  onLanguageChange,
  actions,
  onCreateNew,
  hideCreateNew = false,
  modelBadge,
}: TranscriptionHeaderProps) => {
  const { openSettings } = useSettingsDialog();

  const settingsItems: Array<{ label: string; section: SettingsSectionId }> = useMemo(
    () => [{ label: "Model settings", section: "model-routing" }],
    [],
  );

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.topRow)}>
        <BackButton />

        {actions}
      </div>
      <div {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.panelRow)}>
          <div {...stylex.props(styles.actions)}>
            {!hideCreateNew && (
              <Button onClick={onCreateNew} {...stylex.props(styles.primaryButton)}>
                <PlusIcon {...stylex.props(styles.icon)} weight="bold" />
                Create new
              </Button>
            )}
            <AppMenu>
              <AppMenuTrigger className={stylex.props(styles.secondaryButton).className}>
                <SlidersHorizontalIcon {...stylex.props(styles.icon)} />
                Settings
              </AppMenuTrigger>
              <AppMenuContent className={stylex.props(styles.menu).className}>
                <div {...stylex.props(styles.languageSection)}>
                  <div {...stylex.props(styles.languageControl)}>
                    <LanguageSelector language={language} setLanguage={onLanguageChange} />
                  </div>
                </div>
                <div {...stylex.props(styles.separator)} />
                {settingsItems.map((item) => (
                  <AppMenuItem
                    key={item.section}
                    onClick={() => openSettings(item.section)}
                    className={stylex.props(styles.menuItem).className}
                  >
                    <span>{item.label}</span>
                    <GearSixIcon {...stylex.props(styles.menuIcon)} />
                  </AppMenuItem>
                ))}
              </AppMenuContent>
            </AppMenu>
          </div>
          <AudioVisualizer stream={stream} className={stylex.props(styles.visualizer).className} />
          <span {...stylex.props(styles.badge)}>
            <div
              {...stylex.props(
                styles.statusDot,
                modelBadge.tone === "success"
                  ? styles.statusSuccess
                  : modelBadge.tone === "warning"
                    ? styles.statusWarning
                    : styles.statusNeutral,
              )}
            />
            {modelBadge.label}
          </span>
        </div>
      </div>
    </div>
  );
};
