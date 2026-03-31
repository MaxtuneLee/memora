import { Toast } from "@base-ui/react/toast";
import {
  BrainIcon,
  CaretDownIcon,
  CpuIcon,
  DatabaseIcon,
  GearSixIcon,
  InfoIcon,
  KeyboardIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";

import SettingsAiProviderSection from "@/components/settings/SettingsAiProviderSection";
import SettingsAboutSection from "@/components/settings/SettingsAboutSection";
import {
  SETTINGS_ICON_BUTTON_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
  SETTINGS_SECONDARY_BUTTON_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import SettingsMemorySection from "@/components/settings/SettingsMemorySection";
import SettingsSkillsSection from "@/components/settings/SettingsSkillsSection";
import SettingsStorageSection from "@/components/settings/SettingsStorageSection";
import ToastStack from "@/components/ToastStack";
import { NativeDialog } from "@/components/ui/NativeDialog";
import { cn } from "@/lib/cn";
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

const SETTINGS_SECTION_ICONS: Record<SettingsSectionId, typeof GearSixIcon> = {
  general: GearSixIcon,
  hotkeys: KeyboardIcon,
  "ai-provider": CpuIcon,
  memory: BrainIcon,
  skills: SparkleIcon,
  "data-storage": DatabaseIcon,
  about: InfoIcon,
};

const SETTINGS_PLACEHOLDER_COPY: Partial<
  Record<
    "general" | "hotkeys",
    {
      summary: string;
    }
  >
> = {
  general: {
    summary: "Workspace identity, appearance, and day-to-day defaults are being consolidated here.",
  },
  hotkeys: {
    summary: "Keyboard workflows and command habits will live in one place instead of being scattered.",
  },
};

function SettingsPlaceholderSection({
  summary,
  title,
}: {
  summary: string;
  title: string;
}) {
  return (
    <section className={SETTINGS_PANEL_CLASS_NAME}>
      <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>{title}</h3>
      <p className={cn(SETTINGS_SECTION_BODY_CLASS_NAME, "mt-2")}>{summary}</p>
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
    <button
      type="button"
      onClick={() => onSectionChange(sectionId)}
      className={cn(
        "group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 select-none",
        isActive ? "text-zinc-900" : "text-zinc-500 hover:bg-white/60 hover:text-zinc-900",
      )}
    >
      {isActive ? (
        <motion.div
          layoutId={layoutId}
          className="pointer-events-none absolute inset-0 rounded-xl border border-[#e7e1d8] bg-[rgba(255,255,255,0.72)] shadow-sm"
          transition={reducedMotion ? { duration: 0.12 } : SETTINGS_NAV_HIGHLIGHT_TRANSITION}
        />
      ) : null}

      <Icon
        weight={isActive ? "fill" : "regular"}
        className={cn(
          "relative z-10 size-4 shrink-0 transition-colors",
          isActive ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600",
        )}
      />
      <span className="relative z-10 min-w-0 truncate">{label}</span>
    </button>
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
        <div className="space-y-0.5">
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
    if (activeSection === "ai-provider") {
      return <SettingsAiProviderSection open={open} />;
    }

    if (activeSection === "memory") {
      return <SettingsMemorySection open={open} />;
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
          (activeSection === "general" || activeSection === "hotkeys"
            ? SETTINGS_PLACEHOLDER_COPY[activeSection]?.summary
            : undefined) ?? activeSectionData?.description ?? "Manage your workspace preferences."
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
        viewportClassName="p-3 sm:p-5 md:p-8"
        panelClassName="overflow-hidden rounded-[1.5rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] shadow-[0_32px_80px_-56px_rgba(34,33,29,0.42)]"
        panelStyle={{ width: "min(96vw, 980px)" }}
      >
        <div className="flex h-[min(88vh,720px)] flex-col overflow-hidden md:grid md:grid-cols-[13.5rem_minmax(0,1fr)]">
          <aside className="hidden border-r border-[var(--color-memora-border)] bg-[var(--color-memora-surface-soft)] md:block">
            <div className="px-3 py-4">
              <SettingsSectionNav
                activeSection={activeSection}
                layoutGroupId="settings-section-navigation-desktop"
                layoutId="settings-active-item"
                onSectionChange={handleSectionChange}
              />
            </div>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-memora-canvas)]">
            <div className="border-b border-[var(--color-memora-border)] px-4 py-4 sm:px-6 md:px-7">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2
                    id={titleId}
                    className="text-[1.65rem] leading-tight font-semibold text-[var(--color-memora-text-strong)]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {activeSectionData?.label ?? "Settings"}
                  </h2>
                  <p
                    id={descriptionId}
                    className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--color-memora-text-muted)]"
                  >
                    {activeSectionData?.description ?? "Manage your workspace preferences."}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(SETTINGS_SECONDARY_BUTTON_CLASS_NAME, "md:hidden")}
                    aria-expanded={isMobileNavigationOpen}
                    aria-controls="settings-section-directory"
                    onClick={() => setIsMobileNavigationOpen((current) => !current)}
                  >
                    <span>Sections</span>
                    <CaretDownIcon
                      className={cn(
                        "size-3.5 transition-transform duration-300 ease-[var(--ease-out-quart)]",
                        isMobileNavigationOpen ? "rotate-180" : "",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className={SETTINGS_ICON_BUTTON_CLASS_NAME}
                    aria-label="Close settings"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
              </div>

              <div
                id="settings-section-directory"
                className={cn(
                  "overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-[var(--ease-out-quart)] md:hidden",
                  isMobileNavigationOpen ? "mt-4 grid grid-rows-[1fr] opacity-100" : "grid grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0">
                  <div className="rounded-[1rem] bg-[var(--color-memora-surface-soft)] p-2">
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

            <div className="memora-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-7 md:py-6">
              <div className="mx-auto w-full max-w-[44rem] space-y-4">{renderSectionContent()}</div>
            </div>
          </div>
        </div>
      </NativeDialog>

      <ToastStack
        render={(toast) => (
          <Toast.Content className="flex items-start gap-3 rounded-[1.15rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-4 py-3 shadow-[0_24px_60px_-42px_rgba(34,33,29,0.3)] transition">
            <span className={cn("mt-1 size-2 rounded-full", toastIconColor(toast.type))} />
            <div className="space-y-1">
              <Toast.Title className="text-sm font-semibold text-[var(--color-memora-text-strong)]">
                {toast.title}
              </Toast.Title>
              {toast.description ? (
                <Toast.Description className="text-xs leading-5 text-[var(--color-memora-text-muted)]">
                  {toast.description}
                </Toast.Description>
              ) : null}
            </div>
            <Toast.Close
              className="ml-auto text-[var(--color-memora-text-soft)] transition hover:text-[var(--color-memora-text)]"
              onClick={() => close(toast.id)}
            >
              <XIcon className="size-3" />
            </Toast.Close>
          </Toast.Content>
        )}
      />
    </>
  );
}
