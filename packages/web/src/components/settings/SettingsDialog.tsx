import { Dialog } from "@base-ui/react/dialog";
import { Toast } from "@base-ui/react/toast";
import { XIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { motion } from "motion/react";

import SettingsAiProviderSection from "@/components/settings/SettingsAiProviderSection";
import SettingsAboutSection from "@/components/settings/SettingsAboutSection";
import SettingsMemorySection from "@/components/settings/SettingsMemorySection";
import SettingsSkillsSection from "@/components/settings/SettingsSkillsSection";
import SettingsStorageSection from "@/components/settings/SettingsStorageSection";
import ToastStack from "@/components/ToastStack";
import { cn } from "@/lib/cn";
import { toastIconColor } from "@/lib/settings/dialogHelpers";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "@/types/settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSection: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
}

export default function SettingsDialog({
  open,
  onOpenChange,
  activeSection,
  onSectionChange,
}: SettingsDialogProps) {
  const { close } = Toast.useToastManager();
  const activeSectionData = useMemo(() => {
    return SETTINGS_SECTIONS.find((section) => section.id === activeSection);
  }, [activeSection]);

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
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-6 text-sm text-zinc-500">
        {activeSectionData?.description ?? "Settings are coming soon."}
      </div>
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          render={(props, state) => {
            const {
              onDrag,
              onDragEnd,
              onDragStart,
              onAnimationStart,
              onAnimationEnd,
              onAnimationIteration,
              ...rest
            } = props;
            void onDrag;
            void onDragEnd;
            void onDragStart;
            void onAnimationStart;
            void onAnimationEnd;
            void onAnimationIteration;
            return (
              <motion.div
                {...rest}
                className={props.className}
                initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                animate={
                  state.open
                    ? { opacity: 1, backdropFilter: "blur(6px)" }
                    : { opacity: 0, backdropFilter: "blur(0px)" }
                }
                transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
              />
            );
          }}
          className="fixed inset-0 z-40 bg-zinc-900/30"
        />
        <Dialog.Popup
          render={(props, state) => {
            const {
              onDrag,
              onDragEnd,
              onDragStart,
              onAnimationStart,
              onAnimationEnd,
              onAnimationIteration,
              ...rest
            } = props;
            void onDrag;
            void onDragEnd;
            void onDragStart;
            void onAnimationStart;
            void onAnimationEnd;
            void onAnimationIteration;
            return (
              <motion.div
                {...rest}
                className={props.className}
                initial={{ opacity: 0, scale: 0.96, y: 18 }}
                animate={
                  state.open ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: 10 }
                }
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
              />
            );
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(960px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        >
          <div className="grid min-h-130 grid-cols-[220px_1fr]">
            <div className="border-r border-zinc-200 bg-zinc-50/70 p-4">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Settings
              </div>
              <nav className="space-y-1">
                {SETTINGS_SECTIONS.map((section) => {
                  const isActive = section.id === activeSection;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => onSectionChange(section.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                        isActive
                          ? "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-500 hover:bg-white/70 hover:text-zinc-900",
                      )}
                    >
                      <span>{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="flex flex-col">
              <div className="flex items-start justify-between border-b border-zinc-200/70 px-6 py-5">
                <div>
                  <Dialog.Title className="text-xl font-semibold text-zinc-900">
                    {activeSectionData?.label ?? "Settings"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm text-zinc-500">
                    {activeSectionData?.description ?? "Manage your workspace preferences."}
                  </Dialog.Description>
                </div>
                <Dialog.Close className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">
                  <XIcon className="size-4" />
                </Dialog.Close>
              </div>
              <div className="max-h-[60vh] flex-1 space-y-6 overflow-y-auto px-6 py-6">
                {renderSectionContent()}
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>

      <ToastStack
        render={(toast) => (
          <Toast.Content className="flex items-start gap-3 transition">
            <span className={cn("mt-1 size-2 rounded-full", toastIconColor(toast.type))} />
            <div className="space-y-1">
              <Toast.Title className="text-sm font-semibold text-zinc-900">
                {toast.title}
              </Toast.Title>
              {toast.description ? (
                <Toast.Description className="text-xs text-zinc-500">
                  {toast.description}
                </Toast.Description>
              ) : null}
            </div>
            <Toast.Close
              className="ml-auto text-zinc-400 hover:text-zinc-700"
              onClick={() => close(toast.id)}
            >
              <XIcon className="size-3" />
            </Toast.Close>
          </Toast.Content>
        )}
      />
    </Dialog.Root>
  );
}
