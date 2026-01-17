import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Toast } from "@base-ui/react/toast";
import { XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "../lib/cn";
import { formatBytes } from "../lib/format";
import { useStorageStats } from "../hooks/useStorageStats";
import ToastStack from "./ToastStack";

import { motion } from "motion/react";

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "Profile, workspace, and appearance settings.",
  },
  {
    id: "hotkeys",
    label: "Hotkeys",
    description: "Shortcuts and command palette preferences.",
  },
  {
    id: "ai-provider",
    label: "AI Service Provider",
    description: "Manage AI runtime and model endpoints.",
  },
  {
    id: "data-storage",
    label: "Data Storage",
    description: "Storage usage and persistence options.",
  },
  {
    id: "about",
    label: "About",
    description: "Version, build, and support information.",
  },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

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
  const [isPersistRequesting, setIsPersistRequesting] = useState(false);
  const { add, close } = Toast.useToastManager();
  const {
    storageUsage,
    storageQuota,
    isStoragePersistent,
    isStorageSupported,
    categories,
    refreshStorageState,
  } = useStorageStats({ autoRefresh: false });

  useEffect(() => {
    if (!open) return;
    void refreshStorageState();
  }, [open, refreshStorageState]);

  const storageSummary = useMemo(() => {
    if (!storageQuota) return "Storage usage not available.";
    return `${formatBytes(storageUsage)} of ${formatBytes(storageQuota)} used`;
  }, [storageQuota, storageUsage]);

  const usagePercentage = useMemo(() => {
    if (!storageQuota) return 0;
    return Math.min(100, Math.round((storageUsage / storageQuota) * 100));
  }, [storageQuota, storageUsage]);

  const activeSectionData = useMemo(
    () => SETTINGS_SECTIONS.find((section) => section.id === activeSection),
    [activeSection]
  );

  const handleRequestPersistence = useCallback(async () => {
    if (!navigator.storage?.persist || isPersistRequesting) {
      add({
        title: "Persistence not supported",
        description: "This browser cannot request persistent storage.",
        type: "error",
      });
      return;
    }

    setIsPersistRequesting(true);
    try {
      const granted = await navigator.storage.persist();
      add({
        title: granted ? "Persistent storage enabled" : "Persistence denied",
        description: granted
          ? "Your data will be kept for longer periods."
          : "The browser did not grant persistent storage.",
        type: granted ? "success" : "error",
      });
    } catch {
      add({
        title: "Persistence request failed",
        description: "Please try again or check browser permissions.",
        type: "error",
      });
    } finally {
      setIsPersistRequesting(false);
      void refreshStorageState();
    }
  }, [add, isPersistRequesting, refreshStorageState]);

  const toastIconColor = (type?: string) => {
    switch (type) {
      case "success":
        return "bg-emerald-500";
      case "error":
        return "bg-rose-500";
      default:
        return "bg-zinc-400";
    }
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
          className="fixed inset-0 bg-zinc-900/30"
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
            return (
              <motion.div
                {...rest}
                className={props.className}
                initial={{ opacity: 0, scale: 0.96, y: 18 }}
                animate={
                  state.open
                    ? { opacity: 1, scale: 1, y: 0 }
                    : { opacity: 0, scale: 0.98, y: 10 }
                }
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
              />
            );
          }}
          className="fixed left-1/2 top-1/2 w-[min(960px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
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
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors",
                        isActive
                          ? "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-500 hover:bg-white/70 hover:text-zinc-900"
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
                    {activeSectionData?.description ??
                      "Manage your workspace preferences."}
                  </Dialog.Description>
                </div>
                <Dialog.Close className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">
                  <XIcon className="size-4" />
                </Dialog.Close>
              </div>
              <div className="flex-1 space-y-6 px-6 py-6">
                {activeSection === "data-storage" ? (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">
                            Local storage usage
                          </h4>
                          <p className="mt-1 text-sm text-zinc-500">
                            {storageSummary}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-zinc-500">
                          {usagePercentage}%
                        </span>
                      </div>
                      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                        {categories.map((category) => (
                          <div
                            key={category.id}
                            className={category.color}
                            style={{ width: `${category.fraction * 100}%` }}
                          />
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
                        {categories.map((category) => (
                          <div
                            key={category.id}
                            className="flex items-center gap-1.5"
                          >
                            <span
                              className={`size-2 rounded-full ${category.color}`}
                            />
                            <span>{category.label}</span>
                            <span className="text-[11px] text-zinc-400">
                              {formatBytes(category.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-6">
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900">
                            Persistent storage
                          </h4>
                          <p className="mt-1 text-sm text-zinc-500">
                            {isStorageSupported
                              ? isStoragePersistent
                                ? "Your browser granted persistent storage."
                                : "Request persistence to reduce eviction risk."
                              : "Persistent storage is not supported in this browser."}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              isStoragePersistent
                                ? "bg-emerald-500"
                                : "bg-amber-500"
                            )}
                          />
                          {isStoragePersistent ? "Enabled" : "Not enabled"}
                        </div>
                      </div>
                      <div className="mt-4">
                        <Button
                          disabled={
                            !isStorageSupported ||
                            isStoragePersistent ||
                            isPersistRequesting
                          }
                          onClick={handleRequestPersistence}
                          className="rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300"
                        >
                          {isStoragePersistent
                            ? "Persistence enabled"
                            : isPersistRequesting
                              ? "Requesting..."
                              : "Request persistence"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-6 text-sm text-zinc-500">
                    {activeSectionData?.description ??
                      "Settings are coming soon."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>

      <ToastStack
        render={(toast) => (
          <Toast.Content className="flex items-start gap-3 transition">
            <span
              className={cn(
                "mt-1 size-2 rounded-full",
                toastIconColor(toast.type)
              )}
            />
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
