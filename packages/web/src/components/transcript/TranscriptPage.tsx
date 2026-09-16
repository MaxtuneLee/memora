import { Button } from "@base-ui/react/button";
import { isNemotronAsrModel } from "@memora/local-model-runtime";
import { CaretDownIcon, GearSixIcon, PlusIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { motion, useReducedMotion } from "motion/react";
import { type ReactElement, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import { LanguageSelector } from "@/components/transcript/LanguageSelector";
import { TranscriptWorkbench } from "@/components/transcript/transcriptLanding/TranscriptWorkbench";
import { getTranscriptHistoryRowState } from "@/components/transcript/transcriptLanding/transcriptLandingState";
import type { SettingsSectionId } from "@/types/settings";
import type { RecordingItem } from "@/types/library";
import { useMediaFiles } from "@/hooks/library/useMediaFiles";
import { useModelRouting } from "@/hooks/settings/useModelRouting";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { TRANSCRIPT_LANGUAGE_STORAGE_KEY } from "@/lib/transcript/transcriptUtils";

const SECTION_EASE = [0.22, 1, 0.36, 1] as const;

const styles = stylex.create({
  page: {
    marginInline: "auto",
    maxWidth: 1080,
    paddingBlock: "2rem",
    paddingInline: "1.5rem",
    width: "100%",
    "@media (min-width: 768px)": { paddingBlock: "2.5rem", paddingInline: "2.5rem" },
  },
  header: {
    borderBottomColor: "#e9e5dc",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    paddingBottom: "1rem",
    "@media (min-width: 768px)": {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  title: {
    color: "#22211d",
    fontFamily: "var(--font-serif)",
    fontSize: "clamp(1.9rem, 4vw, 2.45rem)",
    fontWeight: 600,
    letterSpacing: "-0.045em",
    lineHeight: 0.98,
  },
  description: {
    color: "#716c64",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.5rem",
    maxWidth: "34rem",
    "@media (min-width: 768px)": { fontSize: 15 },
  },
  actions: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem" },
  createButton: {
    alignItems: "center",
    backgroundColor: { default: "#22211d", ":hover": "#34312b", ":active": "#1d1c18" },
    borderColor: { default: "#2b2925", ":hover": "#4a463e", ":active": "#1f1e1a" },
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: {
      default: "inset 0 1px 0 rgb(255 255 255 / 0.05), 0 10px 24px -22px rgb(34 33 29 / 0.55)",
      ":hover":
        "inset 0 1px 0 rgb(255 255 255 / 0.12), 0 0 0 1px rgb(255 251 242 / 0.08), 0 10px 24px -22px rgb(34 33 29 / 0.55)",
      ":active": "inset 0 1px 0 rgb(255 255 255 / 0.03), 0 6px 14px -14px rgb(34 33 29 / 0.42)",
    },
    color: "#fffdfa",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
    minHeight: "2.75rem",
    paddingInline: "1rem",
    transitionDuration: "300ms",
    transitionProperty: "background-color, border-color, box-shadow, transform",
    transitionTimingFunction: "var(--ease-out-quart)",
    ":hover": { transform: "translateY(-0.125rem)" },
    ":active": { transform: "translateY(0)" },
  },
  createIcon: { height: "1rem", marginRight: "0.5rem", width: "1rem" },
  menuTrigger: {
    backgroundColor: { default: "#fffdfa", ":hover": "#fffcf6", "[data-open=true]": "#fffcf6" },
    borderColor: { default: "#e7e1d8", "[data-open=true]": "#ddd7cb" },
    borderRadius: "9999px",
    boxShadow: "none",
    gap: "0.625rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.625rem",
    ":hover": { boxShadow: "none" },
    "[data-open=true]": { boxShadow: "none" },
  },
  menuIconFrame: {
    alignItems: "center",
    backgroundColor: "#f6f3ec",
    borderRadius: "9999px",
    color: "#7c7265",
    display: "flex",
    flexShrink: 0,
    height: "1.75rem",
    justifyContent: "center",
    transitionDuration: "300ms",
    transitionProperty: "background-color, color",
    transitionTimingFunction: "var(--ease-out-quart)",
    width: "1.75rem",
  },
  menuIcon: { height: 18, width: 18 },
  menuLabel: { color: "#22211d", fontSize: "0.875rem", fontWeight: 600, lineHeight: "1.25rem" },
  caret: { color: "#9a948a", flexShrink: 0, height: "0.875rem", width: "0.875rem" },
  menuContent: { width: 292 },
  languagePanel: {
    backgroundColor: "#fcfaf5",
    borderRadius: "1rem",
    color: "#6f695f",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    padding: "0.75rem",
  },
  divider: { backgroundColor: "#ede7dc", height: 1, marginBlock: "0.5rem" },
  menuItem: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": "#f8f4ec" },
    borderRadius: "1rem",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    justifyContent: "space-between",
    lineHeight: "1.25rem",
    padding: "0.75rem",
    textAlign: "left",
    transitionDuration: "300ms",
    transitionProperty: "background-color",
    transitionTimingFunction: "var(--ease-out-quart)",
    width: "100%",
  },
  itemText: { minWidth: 0 },
  itemTitle: {
    color: "#2b2925",
    display: "block",
    fontSize: 14,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemDescription: {
    color: "#7b7469",
    display: "block",
    fontSize: 13,
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  itemIconFrame: {
    alignItems: "center",
    backgroundColor: "#f6f1e8",
    borderRadius: "9999px",
    color: "#90897d",
    display: "flex",
    flexShrink: 0,
    height: "2.25rem",
    justifyContent: "center",
    transitionDuration: "300ms",
    transitionProperty: "background-color, color",
    transitionTimingFunction: "var(--ease-out-quart)",
    width: "2.25rem",
  },
  workbench: { marginTop: "1.5rem" },
});

export const Component = (): ReactElement => {
  const { recordings, deleteRecording } = useMediaFiles();
  const { openSettings } = useSettingsDialog();
  const { routing } = useModelRouting();
  const isNemotronSelected =
    routing.transcription.source === "local" && isNemotronAsrModel(routing.transcription.modelId);
  const reducedMotion = useReducedMotion() ?? false;
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY) ?? "en";
  });

  const navigate = useNavigate();

  const [pendingDelete, setPendingDelete] = useState<RecordingItem | null>(null);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteRecording(pendingDelete);
    setPendingDelete(null);
  };

  const settingsItems: Array<{
    description: string;
    label: string;
    section: SettingsSectionId;
  }> = useMemo(
    () => [
      {
        description: "Choose where each transcription feature runs.",
        label: "Model settings",
        section: "model-routing",
      },
    ],
    [],
  );

  const handleLanguageChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLanguage(trimmed);
    if (typeof window !== "undefined") {
      localStorage.setItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY, trimmed);
    }
  };

  const workbenchItems = useMemo(
    () =>
      recordings.map((recording) => ({
        recording,
        state: getTranscriptHistoryRowState(recording),
      })),
    [recordings],
  );

  return (
    <div {...stylex.props(styles.page)}>
      <motion.header
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reducedMotion ? 0.12 : 0.24,
          ease: SECTION_EASE,
        }}
        {...stylex.props(styles.header)}
      >
        <div>
          <h1 {...stylex.props(styles.title)}>Transcripts</h1>
          <p {...stylex.props(styles.description)}>
            Start a live capture or return to saved transcript work.
          </p>
        </div>

        <div {...stylex.props(styles.actions)}>
          <Button
            onClick={() => navigate("/transcript/live")}
            className={`memora-interactive ${stylex.props(styles.createButton).className ?? ""}`}
          >
            <PlusIcon {...stylex.props(styles.createIcon)} />
            New live transcript
          </Button>
          <AppMenu>
            <AppMenuTrigger
              className={`memora-interactive ${stylex.props(styles.menuTrigger).className ?? ""}`}
            >
              <span {...stylex.props(styles.menuIconFrame)}>
                <SlidersHorizontalIcon {...stylex.props(styles.menuIcon)} />
              </span>
              <span {...stylex.props(styles.menuLabel)}>Settings</span>
              <CaretDownIcon
                data-dashboard-menu-caret=""
                {...stylex.props(styles.caret)}
                weight="bold"
              />
            </AppMenuTrigger>
            <AppMenuContent className={stylex.props(styles.menuContent).className}>
              <div {...stylex.props(styles.languagePanel)}>
                <LanguageSelector
                  language={language}
                  setLanguage={handleLanguageChange}
                  includeAutoDetect={isNemotronSelected}
                />
              </div>
              <div {...stylex.props(styles.divider)} />
              {settingsItems.map((item) => (
                <AppMenuItem
                  key={item.section}
                  onClick={() => openSettings(item.section)}
                  className={stylex.props(styles.menuItem).className}
                >
                  <span {...stylex.props(styles.itemText)}>
                    <span {...stylex.props(styles.itemTitle)}>{item.label}</span>
                    <span {...stylex.props(styles.itemDescription)}>{item.description}</span>
                  </span>
                  <span {...stylex.props(styles.itemIconFrame)}>
                    <GearSixIcon {...stylex.props(styles.menuIcon)} />
                  </span>
                </AppMenuItem>
              ))}
            </AppMenuContent>
          </AppMenu>
        </div>
      </motion.header>
      <div {...stylex.props(styles.workbench)}>
        <TranscriptWorkbench items={workbenchItems} onDelete={setPendingDelete} />
      </div>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Move to trash?"
        description="This transcript will be moved to Trash and can be restored later."
        confirmLabel="Move to Trash"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
