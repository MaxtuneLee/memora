import { Toast } from "@base-ui/react/toast";
import { queryDb } from "@livestore/livestore";
import { useStore } from "@livestore/react";
import { useCallback, useEffect, useState } from "react";

import { useStorageStats } from "@/hooks/settings/useStorageStats";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import {
  exportStorageArchive,
  importStorageArchive,
  type StorageExportProgress,
  type StorageImportProgress,
} from "@/lib/settings/storageExport";
import { collectionTable } from "@/livestore/collection";
import { fileTable, type file as LiveStoreFile } from "@/livestore/file";
import { folderTable, type folder as LiveStoreFolder } from "@/livestore/folder";
import { providerTable, type provider as LiveStoreProvider } from "@/livestore/provider";
import { settingsTable, type setting } from "@/livestore/setting";

interface UseStorageSettingsOptions {
  open: boolean;
}

const storageExportFilesQuery$ = queryDb(() => fileTable.orderBy("updatedAt", "desc"), {
  label: "settings:storage-export-files",
});

const storageExportFoldersQuery$ = queryDb(() => folderTable.orderBy("updatedAt", "desc"), {
  label: "settings:storage-export-folders",
});

const storageExportCollectionsQuery$ = queryDb(() => collectionTable.orderBy("updatedAt", "desc"), {
  label: "settings:storage-export-collections",
});

const storageExportProvidersQuery$ = queryDb(() => providerTable.orderBy("updatedAt", "desc"), {
  label: "settings:storage-export-providers",
});

export const useStorageSettings = ({ open }: UseStorageSettingsOptions) => {
  const { store } = useStore();
  const { add } = Toast.useToastManager();
  const {
    storageUsage,
    storageQuota,
    isStoragePersistent,
    isStorageSupported,
    breakdownSegments,
    contentCategories,
    contentUsage,
    modelCacheUsage,
    usagePercentageLabel,
    refreshStorageState,
  } = useStorageStats({ autoRefresh: false });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<StorageExportProgress | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<StorageImportProgress | null>(null);
  const settings =
    (store.useQuery(settingsDocumentQuery$) as setting | undefined) ?? settingsTable.default.value;
  const files = store.useQuery(storageExportFilesQuery$) as LiveStoreFile[];
  const folders = store.useQuery(storageExportFoldersQuery$) as LiveStoreFolder[];
  const collections = store.useQuery(
    storageExportCollectionsQuery$,
  ) as (typeof collectionTable.Type)[];
  const providers = store.useQuery(storageExportProvidersQuery$) as LiveStoreProvider[];

  useEffect(() => {
    if (!open) {
      return;
    }

    void refreshStorageState();
  }, [open, refreshStorageState]);

  const handleRequestPersistence = useCallback(async () => {
    if (!navigator.storage?.persist) {
      add({
        title: "Persistence not supported",
        description: "This browser cannot request persistent storage.",
        type: "error",
      });
      return;
    }

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
      void refreshStorageState();
    }
  }, [add, refreshStorageState]);

  const handleExportArchive = useCallback(async () => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);
    setExportProgress({
      currentFile: "Preparing export",
      completedBytes: 0,
      totalBytes: 0,
      completedFiles: 0,
      totalFiles: 0,
      phase: "preparing",
    });

    try {
      const result = await exportStorageArchive(
        {
          settings,
          providers,
          files,
          folders,
          collections,
        },
        (progress) => {
          setExportProgress(progress);
        },
      );

      add({
        title: "Export ready",
        description: `${result.fileName} downloaded with ${result.fileCount} items.`,
        type: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      add({
        title: "Export failed",
        description: message,
        type: "error",
      });
    } finally {
      setIsExporting(false);
    }
  }, [add, collections, files, folders, isExporting, providers, settings]);

  const handleImportArchive = useCallback(
    async (archive: File) => {
      if (isImporting) {
        return;
      }

      setIsImporting(true);
      setImportProgress({
        currentFile: archive.name,
        completedBytes: 0,
        totalBytes: archive.size,
        completedFiles: 0,
        totalFiles: 0,
        phase: "reading",
      });

      try {
        const result = await importStorageArchive(
          archive,
          {
            current: {
              settings,
              providers,
              files,
              folders,
              collections,
            },
            store,
          },
          (progress) => {
            setImportProgress(progress);
          },
        );

        add({
          title: "Import complete",
          description: `${result.fileName} restored ${result.importedFiles} files from the archive.`,
          type: "success",
        });
        void refreshStorageState();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Please try again.";
        add({
          title: "Import failed",
          description: message,
          type: "error",
        });
      } finally {
        setIsImporting(false);
      }
    },
    [
      add,
      collections,
      files,
      folders,
      isImporting,
      providers,
      refreshStorageState,
      settings,
      store,
    ],
  );

  return {
    storageUsage,
    storageQuota,
    isStoragePersistent,
    isStorageSupported,
    breakdownSegments,
    contentCategories,
    contentUsage,
    modelCacheUsage,
    usagePercentageLabel,
    handleRequestPersistence,
    handleExportArchive,
    handleImportArchive,
    exportProgress,
    isExporting,
    importProgress,
    isImporting,
  };
};
