import { Button } from "@base-ui/react/button";
import { useMemo, useState } from "react";

import {
  SETTINGS_BADGE_CLASS_NAME,
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_PRIMARY_BUTTON_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { useStorageSettings } from "@/hooks/settings/useStorageSettings";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

interface SettingsStorageSectionProps {
  open: boolean;
}

export default function SettingsStorageSection({ open }: SettingsStorageSectionProps) {
  const {
    breakdownSegments,
    contentCategories,
    contentUsage,
    storageUsage,
    storageQuota,
    usagePercentageLabel,
    isStoragePersistent,
    isStorageSupported,
    handleRequestPersistence,
  } = useStorageSettings({ open });
  const [isPersistRequesting, setIsPersistRequesting] = useState(false);
  const storageSummary = useMemo(() => {
    if (!storageQuota) {
      return "Storage usage not available.";
    }

    return `${formatBytes(storageUsage)} of ${formatBytes(storageQuota)} used`;
  }, [storageQuota, storageUsage]);
  const visibleBreakdownSegments = useMemo(() => {
    return breakdownSegments.filter((segment) => segment.size > 0);
  }, [breakdownSegments]);
  const visibleContentCategories = useMemo(() => {
    return contentCategories.filter((category) => category.size > 0);
  }, [contentCategories]);

  const handlePersistClick = async (): Promise<void> => {
    if (isPersistRequesting) {
      return;
    }

    setIsPersistRequesting(true);
    try {
      await handleRequestPersistence();
    } finally {
      setIsPersistRequesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Browser storage</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              {storageSummary} This includes user content, local databases, caches, and service
              workers.
            </p>
          </div>
          <span className={SETTINGS_BADGE_CLASS_NAME}>{usagePercentageLabel}</span>
        </div>

        <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-memora-border)]">
          {visibleBreakdownSegments.map((segment) => (
            <div
              key={segment.id}
              className={segment.color}
              style={{ width: `${segment.fraction * 100}%` }}
            />
          ))}
        </div>

        {visibleBreakdownSegments.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--color-memora-text-muted)]">
            {visibleBreakdownSegments.map((segment) => (
              <div key={segment.id} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", segment.color)} />
                <span>{segment.label}</span>
                <span className="text-[11px] text-[var(--color-memora-text-soft)]">
                  {formatBytes(segment.size)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "mt-5")}>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No browser storage used yet.</p>
          </div>
        )}
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>User content</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              Files and downloaded models saved by Memora.
            </p>
          </div>
          <span className={SETTINGS_BADGE_CLASS_NAME}>{formatBytes(contentUsage)}</span>
        </div>

        {visibleContentCategories.length > 0 ? (
          <div className="mt-5 space-y-4">
            {visibleContentCategories.map((category) => (
              <div key={category.id} className={SETTINGS_INSET_PANEL_CLASS_NAME}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 text-[var(--color-memora-text)]">
                    <span className={cn("size-2 rounded-full", category.color)} />
                    <span className="font-medium">{category.label}</span>
                  </div>
                  <span className="text-xs font-semibold text-[var(--color-memora-text-soft)]">
                    {formatBytes(category.size)}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-memora-border)]">
                  <div
                    className={cn("h-full rounded-full", category.color)}
                    style={{ width: `${category.fraction * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "mt-5")}>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No user files stored yet.</p>
          </div>
        )}
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Persistent storage</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              {isStorageSupported
                ? isStoragePersistent
                  ? "Your browser granted persistent storage, reducing eviction risk."
                  : "Request persistence to reduce the chance of browser eviction."
                : "Persistent storage is not supported in this browser."}
            </p>
          </div>
          <span className={SETTINGS_BADGE_CLASS_NAME}>
            {isStoragePersistent ? "Enabled" : "Not enabled"}
          </span>
        </div>

        <div
          className={cn(
            SETTINGS_INSET_PANEL_CLASS_NAME,
            "mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <p className="text-sm leading-6 text-[var(--color-memora-text-muted)]">
            Persistence helps keep locally stored data in place between browser cleanup cycles.
          </p>
          <Button
            disabled={!isStorageSupported || isStoragePersistent || isPersistRequesting}
            onClick={() => void handlePersistClick()}
            className={SETTINGS_PRIMARY_BUTTON_CLASS_NAME}
          >
            {isStoragePersistent
              ? "Persistence enabled"
              : isPersistRequesting
                ? "Requesting..."
                : "Request persistence"}
          </Button>
        </div>
      </section>
    </div>
  );
}
