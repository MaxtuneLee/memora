import { Toast } from "@base-ui/react/toast";
import {
  BrainIcon,
  CaretDownIcon,
  CpuIcon,
  DatabaseIcon,
  GearSixIcon,
  HardDrivesIcon,
  InfoIcon,
  ListMagnifyingGlassIcon,
  KeyboardIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import * as stylex from "@stylexjs/stylex";

import SettingsAiProviderSection from "@/components/settings/SettingsAiProviderSection";
import SettingsModelRoutingSection from "@/components/settings/SettingsModelRoutingSection";
import SettingsAboutSection from "@/components/settings/SettingsAboutSection";
import SettingsGeneralSection from "@/components/settings/SettingsGeneralSection";
import {
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import SettingsMemorySection from "@/components/settings/SettingsMemorySection";
import SettingsIndexingSection from "@/components/settings/SettingsIndexingSection";
import SettingsLocalModelsSection from "@/components/settings/SettingsLocalModelsSection";
import SettingsSkillsSection from "@/components/settings/SettingsSkillsSection";
import SettingsStorageSection from "@/components/settings/SettingsStorageSection";
import ToastStack from "@/components/ToastStack";
import { NativeDialog } from "@/components/ui/NativeDialog";
import { toastIconColor } from "@/lib/settings/dialogHelpers";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "@/types/settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSection: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
}

const SETTINGS_NAV_HIGHLIGHT_TRANSITION = {
  type: "spring",
  stiffness: 430,
  damping: 36,
  mass: 0.72,
} as const;

const styles = stylex.create({
  bodyMargin: { marginTop: 8 },
  navButton: {
    alignItems: "center",
    borderRadius: 12,
    display: "flex",
    fontSize: 14,
    fontWeight: 500,
    gap: 10,
    justifyContent: "flex-start",
    outline: "none",
    paddingBlock: 8,
    paddingInline: 10,
    position: "relative",
    textAlign: "left",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color",
    userSelect: "none",
    width: "100%",
    ":focus-visible": { boxShadow: "0 0 0 2px #a1a1aa, 0 0 0 3px #fff" },
  },
  navActive: { color: "#18181b" },
  navIdle: {
    color: "#71717a",
    ":hover": { backgroundColor: "rgb(255 255 255 / 0.6)", color: "#18181b" },
  },
  navHighlight: {
    backgroundColor: "rgb(255 255 255 / 0.72)",
    border: "1px solid #e7e1d8",
    borderRadius: 12,
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  navIcon: {
    flexShrink: 0,
    height: 16,
    position: "relative",
    transition: "color 150ms",
    width: 16,
    zIndex: 10,
  },
  navActiveIcon: { color: "#18181b" },
  navIdleIcon: { color: "#a1a1aa" },
  navLabel: {
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    zIndex: 10,
  },
  navStack: { display: "flex", flexDirection: "column", gap: 2 },
  viewport: {
    padding: 12,
    "@media (min-width: 640px)": { padding: 20 },
    "@media (min-width: 768px)": { padding: 32 },
  },
  panel: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 24,
    boxShadow: "0 32px 80px -56px rgb(34 33 29 / 0.42)",
    overflow: "hidden",
  },
  layout: {
    display: "flex",
    flexDirection: "column",
    height: "min(88vh, 720px)",
    overflow: "hidden",
    "@media (min-width: 768px)": { display: "grid", gridTemplateColumns: "13.5rem minmax(0, 1fr)" },
  },
  aside: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRight: "1px solid var(--color-memora-border)",
    display: "none",
    "@media (min-width: 768px)": { display: "block" },
  },
  asidePadding: { paddingBlock: 16, paddingInline: 12 },
  main: {
    backgroundColor: "var(--color-memora-canvas)",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
  header: {
    borderBottom: "1px solid var(--color-memora-border)",
    padding: 16,
    "@media (min-width: 640px)": { paddingInline: 24 },
    "@media (min-width: 768px)": { paddingInline: 28 },
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    color: "var(--color-memora-text-strong)",
    fontSize: "1.65rem",
    fontWeight: 600,
    lineHeight: 1.25,
    margin: 0,
  },
  description: {
    color: "var(--color-memora-text-muted)",
    fontSize: 14,
    lineHeight: "24px",
    marginTop: 6,
    maxWidth: "42rem",
  },
  headerActions: { alignItems: "center", display: "flex", gap: 8 },
  mobileButton: { "@media (min-width: 768px)": { display: "none" } },
  chevron: { height: 14, transition: "transform 300ms var(--ease-out-quart)", width: 14 },
  rotated: { transform: "rotate(180deg)" },
  icon: { height: 16, width: 16 },
  mobileDirectory: {
    overflow: "hidden",
    transition:
      "grid-template-rows 300ms var(--ease-out-quart), opacity 300ms var(--ease-out-quart), margin 300ms var(--ease-out-quart)",
    "@media (min-width: 768px)": { display: "none" },
  },
  directoryOpen: { display: "grid", gridTemplateRows: "1fr", marginTop: 16, opacity: 1 },
  directoryClosed: { display: "grid", gridTemplateRows: "0fr", opacity: 0 },
  directoryInner: { minHeight: 0 },
  directorySurface: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRadius: 16,
    padding: 8,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: 20,
    paddingInline: 16,
    "@media (min-width: 640px)": { paddingInline: 24 },
    "@media (min-width: 768px)": { paddingBlock: 24, paddingInline: 28 },
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginInline: "auto",
    maxWidth: "44rem",
    width: "100%",
  },
  toast: {
    alignItems: "flex-start",
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 18,
    boxShadow: "0 24px 60px -42px rgb(34 33 29 / 0.3)",
    display: "flex",
    gap: 12,
    paddingBlock: 12,
    paddingInline: 16,
    transition: "all 150ms",
  },
  toastDot: { borderRadius: 9999, flexShrink: 0, height: 8, marginTop: 4, width: 8 },
  toastText: { display: "flex", flexDirection: "column", gap: 4 },
  toastTitle: { color: "var(--color-memora-text-strong)", fontSize: 14, fontWeight: 600 },
  toastDescription: { color: "var(--color-memora-text-muted)", fontSize: 12, lineHeight: "20px" },
  toastClose: {
    color: "var(--color-memora-text-soft)",
    marginLeft: "auto",
    transition: "color 150ms",
    ":hover": { color: "var(--color-memora-text)" },
  },
  toastIcon: { height: 12, width: 12 },
});

const SETTINGS_SECTION_ICONS: Record<SettingsSectionId, typeof GearSixIcon> = {
  general: GearSixIcon,
  hotkeys: KeyboardIcon,
  "ai-provider": CpuIcon,
  "model-routing": CpuIcon,
  "local-models": HardDrivesIcon,
  memory: BrainIcon,
  indexing: ListMagnifyingGlassIcon,
  skills: SparkleIcon,
  "data-storage": DatabaseIcon,
  about: InfoIcon,
};

const SETTINGS_PLACEHOLDER_COPY: Partial<
  Record<
    "hotkeys",
    {
      summary: string;
    }
  >
> = {
  hotkeys: {
    summary:
      "Keyboard workflows and command habits will live in one place instead of being scattered.",
  },
};

function SettingsPlaceholderSection({ summary, title }: { summary: string; title: string }) {
  return (
    <section className={SETTINGS_PANEL_CLASS_NAME}>
      <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>{title}</h3>
      <p
        className={`${SETTINGS_SECTION_BODY_CLASS_NAME} ${stylex.props(styles.bodyMargin).className}`}
      >
        {summary}
      </p>
    </section>
  );
}

function SettingsNavItem({
  activeSection,
  icon: Icon,
  layoutId,
  label,
  onSectionChange,
  reducedMotion,
  sectionId,
}: {
  activeSection: SettingsSectionId;
  icon: typeof GearSixIcon;
  layoutId: string;
  label: string;
  onSectionChange: (section: SettingsSectionId) => void;
  reducedMotion: boolean;
  sectionId: SettingsSectionId;
}) {
  const isActive = sectionId === activeSection;

  return (
    <Button
      variant="plain"
      type="button"
      onClick={() => onSectionChange(sectionId)}
      className={
        stylex.props(styles.navButton, isActive ? styles.navActive : styles.navIdle).className
      }
    >
      {isActive ? (
        <motion.div
          layoutId={layoutId}
          className={stylex.props(styles.navHighlight).className}
          transition={reducedMotion ? { duration: 0.12 } : SETTINGS_NAV_HIGHLIGHT_TRANSITION}
        />
      ) : null}

      <Icon
        weight={isActive ? "fill" : "regular"}
        className={
          stylex.props(styles.navIcon, isActive ? styles.navActiveIcon : styles.navIdleIcon)
            .className
        }
      />
      <span {...stylex.props(styles.navLabel)}>{label}</span>
    </Button>
  );
}

function SettingsSectionNav({
  activeSection,
  layoutGroupId,
  layoutId,
  onSectionChange,
}: {
  activeSection: SettingsSectionId;
  layoutGroupId: string;
  layoutId: string;
  onSectionChange: (section: SettingsSectionId) => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <nav aria-label="Settings sections">
      <LayoutGroup id={layoutGroupId}>
        <div {...stylex.props(styles.navStack)}>
          {SETTINGS_SECTIONS.map((section) => (
            <SettingsNavItem
              key={section.id}
              activeSection={activeSection}
              icon={SETTINGS_SECTION_ICONS[section.id]}
              layoutId={layoutId}
              label={section.label}
              onSectionChange={onSectionChange}
              reducedMotion={reducedMotion}
              sectionId={section.id}
            />
          ))}
        </div>
      </LayoutGroup>
    </nav>
  );
}

export default function SettingsDialog({
  open,
  onOpenChange,
  activeSection,
  onSectionChange,
}: SettingsDialogProps) {
  const { close } = Toast.useToastManager();
  const titleId = useId();
  const descriptionId = useId();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const activeSectionData = useMemo(() => {
    return SETTINGS_SECTIONS.find((section) => section.id === activeSection);
  }, [activeSection]);
  useEffect(() => {
    setIsMobileNavigationOpen(false);
  }, [activeSection, open]);

  const handleSectionChange = (section: SettingsSectionId) => {
    onSectionChange(section);
    setIsMobileNavigationOpen(false);
  };

  const renderSectionContent = () => {
    if (activeSection === "model-routing") return <SettingsModelRoutingSection />;
    if (activeSection === "general") {
      return <SettingsGeneralSection />;
    }

    if (activeSection === "ai-provider") {
      return <SettingsAiProviderSection open={open} />;
    }

    if (activeSection === "memory") {
      return <SettingsMemorySection open={open} />;
    }

    if (activeSection === "indexing") {
      return <SettingsIndexingSection />;
    }

    if (activeSection === "local-models") {
      return <SettingsLocalModelsSection open={open} />;
    }

    if (activeSection === "skills") {
      return <SettingsSkillsSection />;
    }

    if (activeSection === "data-storage") {
      return <SettingsStorageSection open={open} />;
    }

    if (activeSection === "about") {
      return <SettingsAboutSection />;
    }

    return (
      <SettingsPlaceholderSection
        title={activeSectionData?.label ?? "Settings"}
        summary={
          (activeSection === "hotkeys"
            ? SETTINGS_PLACEHOLDER_COPY[activeSection]?.summary
            : undefined) ??
          activeSectionData?.description ??
          "Manage your workspace preferences."
        }
      />
    );
  };

  return (
    <>
      <NativeDialog
        open={open}
        onOpenChange={onOpenChange}
        labelledBy={titleId}
        describedBy={descriptionId}
        viewportClassName={stylex.props(styles.viewport).className}
        panelClassName={stylex.props(styles.panel).className}
        panelStyle={{ width: "min(96vw, 980px)" }}
      >
        <div {...stylex.props(styles.layout)}>
          <aside {...stylex.props(styles.aside)}>
            <div {...stylex.props(styles.asidePadding)}>
              <SettingsSectionNav
                activeSection={activeSection}
                layoutGroupId="settings-section-navigation-desktop"
                layoutId="settings-active-item"
                onSectionChange={handleSectionChange}
              />
            </div>
          </aside>

          <div {...stylex.props(styles.main)}>
            <div {...stylex.props(styles.header)}>
              <div {...stylex.props(styles.headerRow)}>
                <div {...stylex.props(styles.headerText)}>
                  <h2
                    id={titleId}
                    {...stylex.props(styles.title)}
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {activeSectionData?.label ?? "Settings"}
                  </h2>
                  <p id={descriptionId} {...stylex.props(styles.description)}>
                    {activeSectionData?.description ?? "Manage your workspace preferences."}
                  </p>
                </div>

                <div {...stylex.props(styles.headerActions)}>
                  <Button
                    variant="secondary"
                    type="button"
                    className={stylex.props(styles.mobileButton).className}
                    aria-expanded={isMobileNavigationOpen}
                    aria-controls="settings-section-directory"
                    onClick={() => setIsMobileNavigationOpen((current) => !current)}
                  >
                    <span>Sections</span>
                    <CaretDownIcon
                      className={
                        stylex.props(styles.chevron, isMobileNavigationOpen && styles.rotated)
                          .className
                      }
                    />
                  </Button>
                  <Button
                    variant="icon"
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close settings"
                  >
                    <XIcon className={stylex.props(styles.icon).className} />
                  </Button>
                </div>
              </div>

              <div
                id="settings-section-directory"
                {...stylex.props(
                  styles.mobileDirectory,
                  isMobileNavigationOpen ? styles.directoryOpen : styles.directoryClosed,
                )}
              >
                <div {...stylex.props(styles.directoryInner)}>
                  <div {...stylex.props(styles.directorySurface)}>
                    <SettingsSectionNav
                      activeSection={activeSection}
                      layoutGroupId="settings-section-navigation-mobile"
                      layoutId="settings-mobile-active-item"
                      onSectionChange={handleSectionChange}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="memora-scrollbar" {...stylex.props(styles.scroll)}>
              <div {...stylex.props(styles.content)}>{renderSectionContent()}</div>
            </div>
          </div>
        </div>
      </NativeDialog>

      <ToastStack
        render={(toast) => (
          <Toast.Content {...stylex.props(styles.toast)}>
            <span
              {...stylex.props(styles.toastDot)}
              style={{ backgroundColor: toastIconColor(toast.type) }}
            />
            <div {...stylex.props(styles.toastText)}>
              <Toast.Title {...stylex.props(styles.toastTitle)}>{toast.title}</Toast.Title>
              {toast.description ? (
                <Toast.Description {...stylex.props(styles.toastDescription)}>
                  {toast.description}
                </Toast.Description>
              ) : null}
            </div>
            <Toast.Close {...stylex.props(styles.toastClose)} onClick={() => close(toast.id)}>
              <XIcon className={stylex.props(styles.toastIcon).className} />
            </Toast.Close>
          </Toast.Content>
        )}
      />
    </>
  );
}
