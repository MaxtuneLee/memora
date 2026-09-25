import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";

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
import { formatBytes } from "@/lib/format";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 20 },
  sectionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    "@media (min-width: 640px)": {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    "@media (min-width: 1024px)": {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
  },
  heading: { display: "flex", flexDirection: "column", gap: 8 },
  bar: {
    backgroundColor: tokens.border,
    borderRadius: 9999,
    display: "flex",
    height: 10,
    marginTop: 20,
    overflow: "hidden",
    width: "100%",
  },
  segment: { height: "100%" },
  legend: {
    color: tokens.textMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: 12,
    gap: 12,
    marginTop: 16,
  },
  legendItem: { alignItems: "center", display: "flex", gap: 6 },
  dot: { borderRadius: 9999, height: 8, width: 8 },
  soft: { color: tokens.textSoft, fontSize: 11 },
  insetMargin: { marginTop: 20 },
  categoryList: { display: "flex", flexDirection: "column", gap: 16, marginTop: 20 },
  categoryHeader: {
    alignItems: "center",
    color: tokens.text,
    display: "flex",
    fontSize: 14,
    gap: 12,
    justifyContent: "space-between",
  },
  categoryLabel: { alignItems: "center", display: "flex", gap: 8 },
  categoryName: { fontWeight: 500 },
  categorySize: { color: tokens.textSoft, fontSize: 12, fontWeight: 600 },
  categoryBar: {
    backgroundColor: tokens.border,
    borderRadius: 9999,
    height: 6,
    marginTop: 12,
    overflow: "hidden",
  },
  column: { flex: 1, minWidth: 0 },
  progress: { paddingTop: 8 },
  importActions: { alignItems: "center", display: "flex", flexShrink: 0, gap: 12 },
  hidden: { display: "none" },
});

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
    <div {...stylex.props(styles.stack)}>
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.sectionHeader)}>
          <div {...stylex.props(styles.heading)}>
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Browser storage</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              {storageSummary} This includes user content, local databases, caches, and service
              workers.
            </p>
          </div>
          <Badge>{usagePercentageLabel}</Badge>
        </div>

        <div {...stylex.props(styles.bar)}>
          {visibleBreakdownSegments.map((segment) => (
            <div
              key={segment.id}
              {...stylex.props(styles.segment)}
              style={{ backgroundColor: segment.color, width: `${segment.fraction * 100}%` }}
            />
          ))}
        </div>

        {visibleBreakdownSegments.length > 0 ? (
          <div {...stylex.props(styles.legend)}>
            {visibleBreakdownSegments.map((segment) => (
              <div key={segment.id} {...stylex.props(styles.legendItem)}>
                <span {...stylex.props(styles.dot)} style={{ backgroundColor: segment.color }} />
                <span>{segment.label}</span>
                <span {...stylex.props(styles.soft)}>{formatBytes(segment.size)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.insetMargin).className}`}
          >
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No browser storage used yet.</p>
          </div>
        )}
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.sectionHeader)}>
          <div {...stylex.props(styles.heading)}>
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>User content</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              Files saved by Memora. Downloaded models are counted as internal data.
            </p>
          </div>
          <Badge>{formatBytes(contentUsage)}</Badge>
        </div>

        {visibleContentCategories.length > 0 ? (
          <div {...stylex.props(styles.categoryList)}>
            {visibleContentCategories.map((category) => (
              <div key={category.id} className={SETTINGS_INSET_PANEL_CLASS_NAME}>
                <div {...stylex.props(styles.categoryHeader)}>
                  <div {...stylex.props(styles.categoryLabel)}>
                    <span
                      {...stylex.props(styles.dot)}
                      style={{ backgroundColor: category.color }}
                    />
                    <span {...stylex.props(styles.categoryName)}>{category.label}</span>
                  </div>
                  <span {...stylex.props(styles.categorySize)}>{formatBytes(category.size)}</span>
                </div>
                <div {...stylex.props(styles.categoryBar)}>
                  <div
                    {...stylex.props(styles.segment)}
                    style={{
                      backgroundColor: category.color,
                      width: `${category.fraction * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.insetMargin).className}`}
          >
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No user files stored yet.</p>
          </div>
        )}
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.sectionHeader)}>
          <div {...stylex.props(styles.column, styles.heading)}>
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Bulk export</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              Export your Memora data as a ZIP archive. Downloaded local model cache files are not
              included.
            </p>
            {exportProgress ? (
              <div {...stylex.props(styles.progress)}>
                <Progress label={exportCurrentFileLabel} value={exportProgressPercentage} />
                <p {...stylex.props(styles.categorySize)}>
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
        <div {...stylex.props(styles.sectionHeader)}>
          <div {...stylex.props(styles.column, styles.heading)}>
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Bulk import</h3>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
              Restore a Memora export ZIP into this browser. Imported data overwrites matching items
              and restores exported user files and chat data.
            </p>
            {importProgress ? (
              <div {...stylex.props(styles.progress)}>
                <Progress label={importCurrentFileLabel} value={importProgressPercentage} />
                <p {...stylex.props(styles.categorySize)}>
                  {importProgress.phase === "reading"
                    ? "Reading archive"
                    : importProgress.phase === "restoring"
                      ? `Restoring ${importProgress.completedFiles} of ${importProgress.totalFiles} files`
                      : "Applying restored data"}
                </p>
              </div>
            ) : null}
          </div>
          <div {...stylex.props(styles.importActions)}>
            <Input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              className={stylex.props(styles.hidden).className}
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
        <div {...stylex.props(styles.sectionHeader)}>
          <div {...stylex.props(styles.heading)}>
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
