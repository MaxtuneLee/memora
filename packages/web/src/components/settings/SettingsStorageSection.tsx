import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";

import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Progress } from "@/components/ui/Progress";
import { Switch } from "@/components/ui/Switch";
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
    handleExportArchive,
    handleImportArchive,
    exportProgress,
    isExporting,
    importProgress,
    isImporting,
  } = useStorageSettings({ open });
  const [isPersistRequesting, setIsPersistRequesting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
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
  const exportProgressPercentage = useMemo(() => {
    if (!exportProgress) {
      return 0;
    }

    if (exportProgress.totalBytes > 0) {
      return Math.min(100, (exportProgress.completedBytes / exportProgress.totalBytes) * 100);
    }

    if (exportProgress.totalFiles > 0) {
      return Math.min(100, (exportProgress.completedFiles / exportProgress.totalFiles) * 100);
    }

    return 0;
  }, [exportProgress]);
  const exportCurrentFileLabel = useMemo(() => {
    if (!exportProgress) {
      return "Prepare a ZIP archive with your files, sessions, settings, and profile data.";
    }

    return exportProgress.currentFile === "archive-index"
      ? "Finalizing archive index"
      : exportProgress.currentFile;
  }, [exportProgress]);
  const importProgressPercentage = useMemo(() => {
    if (!importProgress) {
      return 0;
    }

    if (importProgress.totalBytes > 0) {
      return Math.min(100, (importProgress.completedBytes / importProgress.totalBytes) * 100);
    }

    if (importProgress.totalFiles > 0) {
      return Math.min(100, (importProgress.completedFiles / importProgress.totalFiles) * 100);
    }

    return 0;
  }, [importProgress]);
  const importCurrentFileLabel = useMemo(() => {
    if (!importProgress) {
      return "Choose a Memora export ZIP file to restore settings, sessions, and files.";
    }

    if (importProgress.currentFile === "restore-complete") {
      return "Restore complete";
    }

    return importProgress.currentFile;
  }, [importProgress]);

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
  const handleImportInputChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const archive = event.target.files?.[0];
    event.target.value = "";
    if (!archive) {
      return;
    }

    await handleImportArchive(archive);
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
          <Badge>{usagePercentageLabel}</Badge>
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
              Files saved by Memora. Downloaded models are counted as internal data.
            </p>
          </div>
          <Badge>{formatBytes(contentUsage)}</Badge>
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
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Bulk export</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              Export your Memora data as a ZIP archive. Downloaded local model cache files are not
              included.
            </p>
            {exportProgress ? (
              <div className="pt-2">
                <Progress label={exportCurrentFileLabel} value={exportProgressPercentage} />
                <p className="text-xs text-[var(--color-memora-text-soft)]">
                  {exportProgress.phase === "preparing"
                    ? `Collecting ${exportProgress.completedFiles} of ${exportProgress.totalFiles} files`
                    : exportProgress.phase === "packing"
                      ? `Packing ${exportProgress.completedFiles} of ${exportProgress.totalFiles} files`
                      : "Finishing archive"}
                </p>
              </div>
            ) : null}
          </div>
          <Button
            variant="primary"
            disabled={isExporting}
            onClick={() => void handleExportArchive()}
          >
            {isExporting ? "Exporting..." : "Export data"}
          </Button>
        </div>
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Bulk import</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              Restore a Memora export ZIP into this browser. Imported data overwrites matching items
              and restores exported user files and chat data.
            </p>
            {importProgress ? (
              <div className="pt-2">
                <Progress label={importCurrentFileLabel} value={importProgressPercentage} />
                <p className="text-xs text-[var(--color-memora-text-soft)]">
                  {importProgress.phase === "reading"
                    ? "Reading archive"
                    : importProgress.phase === "restoring"
                      ? `Restoring ${importProgress.completedFiles} of ${importProgress.totalFiles} files`
                      : "Applying restored data"}
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(event) => void handleImportInputChange(event)}
            />
            <Button
              variant="primary"
              disabled={isImporting || isExporting}
              onClick={() => importInputRef.current?.click()}
            >
              {isImporting ? "Importing..." : "Import data"}
            </Button>
          </div>
        </div>
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
          <Switch
            checked={isStoragePersistent}
            disabled={!isStorageSupported || isStoragePersistent || isPersistRequesting}
            onCheckedChange={(checked) => {
              if (checked) {
                void handlePersistClick();
              }
            }}
            aria-label={
              isStoragePersistent ? "Persistent storage enabled" : "Enable persistent storage"
            }
          />
        </div>
      </section>
    </div>
  );
}
