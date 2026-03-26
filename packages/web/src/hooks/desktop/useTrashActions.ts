import { useCallback, useMemo, useState } from "react";
import type { RecordingMeta } from "@/types/library";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import { fileEvents } from "@/livestore/file";
import { folderEvents } from "@/livestore/folder";
import type { DesktopItem } from "@/types/desktop";
import { collectFolderDescendants } from "@/lib/tree/folderTree";

type ConfirmAction =
  | { kind: "trash"; item: DesktopItem }
  | { kind: "trash-empty" }
  | { kind: "permanent"; item: DesktopItem };

interface UseTrashActionsOptions {
  store: { commit: (event: unknown) => void };
  allFileRows: readonly LiveStoreFile[];
  allFolderRows: readonly LiveStoreFolder[];
  trashedFileItems: { fileMeta: RecordingMeta; id: string }[];
  trashedFolderItems: { id: string }[];
  mapToMeta: (file: LiveStoreFile) => RecordingMeta;
  onDeleteFile: (file: RecordingMeta) => Promise<void>;
  removeItem: (id: string) => void;
}

export function useTrashActions({
  store,
  allFileRows,
  allFolderRows,
  trashedFileItems,
  trashedFolderItems,
  mapToMeta,
  onDeleteFile,
  removeItem,
}: UseTrashActionsOptions) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const collectFolderDescendantsForTrash = useCallback(
    (folderId: string) => {
      return collectFolderDescendants(folderId, allFolderRows, allFileRows);
    },
    [allFileRows, allFolderRows],
  );

  const moveItemToTrash = useCallback(
    async (item: DesktopItem) => {
      if (item.type === "file") {
        store.commit(
          fileEvents.fileDeleted({
            id: item.id,
            deletedAt: new Date(),
          }),
        );
        removeItem(item.id);
        return;
      }
      if (item.type === "folder") {
        const { folders, files } = collectFolderDescendantsForTrash(item.id);
        files.forEach((file) => {
          store.commit(
            fileEvents.fileDeleted({
              id: file.id,
              deletedAt: new Date(),
            }),
          );
        });
        folders.forEach((folder) => {
          store.commit(
            folderEvents.folderDeleted({
              id: folder.id,
              deletedAt: new Date(),
            }),
          );
        });
        removeItem(item.id);
      }
    },
    [collectFolderDescendantsForTrash, removeItem, store],
  );

  const restoreItem = useCallback(
    (item: DesktopItem) => {
      if (item.type === "file") {
        store.commit(
          fileEvents.fileRestored({
            id: item.id,
            updatedAt: new Date(),
          }),
        );
        return;
      }
      if (item.type === "folder") {
        const { folders, files } = collectFolderDescendantsForTrash(item.id);
        files.forEach((file) => {
          store.commit(
            fileEvents.fileRestored({
              id: file.id,
              updatedAt: new Date(),
            }),
          );
        });
        folders.forEach((folder) => {
          store.commit(
            folderEvents.folderRestored({
              id: folder.id,
              updatedAt: new Date(),
            }),
          );
          store.commit(
            folderEvents.folderUpdated({
              id: folder.id,
              updatedAt: new Date(),
              parentId: folder.parentId ?? null,
            }),
          );
        });
      }
    },
    [collectFolderDescendantsForTrash, store],
  );

  const permanentlyDeleteItem = useCallback(
    async (item: DesktopItem) => {
      if (item.type === "file") {
        await onDeleteFile(item.fileMeta);
        store.commit(
          fileEvents.filePurged({
            id: item.id,
            purgedAt: new Date(),
          }),
        );
        removeItem(item.id);
        return;
      }
      if (item.type === "folder") {
        const { folders, files } = collectFolderDescendantsForTrash(item.id);
        for (const file of files) {
          await onDeleteFile(mapToMeta(file));
          store.commit(
            fileEvents.filePurged({
              id: file.id,
              purgedAt: new Date(),
            }),
          );
        }
        folders.forEach((folder) => {
          store.commit(
            folderEvents.folderPurged({
              id: folder.id,
              purgedAt: new Date(),
            }),
          );
        });
        removeItem(item.id);
      }
    },
    [collectFolderDescendantsForTrash, mapToMeta, onDeleteFile, removeItem, store],
  );

  const emptyTrash = useCallback(async () => {
    const filesToPurge: RecordingMeta[] = trashedFileItems.map((f) => f.fileMeta);
    const fileIdsToPurge = new Set(trashedFileItems.map((f) => f.id));

    for (const folder of trashedFolderItems) {
      const { folders, files } = collectFolderDescendantsForTrash(folder.id);
      for (const file of files) {
        if (file.purgedAt || fileIdsToPurge.has(file.id)) continue;
        filesToPurge.push(mapToMeta(file));
        fileIdsToPurge.add(file.id);
      }
      for (const descendant of folders) {
        if (descendant.purgedAt) continue;
        store.commit(
          folderEvents.folderPurged({
            id: descendant.id,
            purgedAt: new Date(),
          }),
        );
      }
    }

    for (const meta of filesToPurge) {
      try {
        await onDeleteFile(meta);
      } catch {
        // OPFS cleanup is best-effort; always commit the purge event
      }
      store.commit(
        fileEvents.filePurged({
          id: meta.id,
          purgedAt: new Date(),
        }),
      );
    }
  }, [
    collectFolderDescendantsForTrash,
    mapToMeta,
    onDeleteFile,
    store,
    trashedFileItems,
    trashedFolderItems,
  ]);

  const requestTrash = useCallback((item: DesktopItem) => {
    setConfirmAction({ kind: "trash", item });
  }, []);

  const requestPermanentDelete = useCallback((item: DesktopItem) => {
    setConfirmAction({ kind: "permanent", item });
  }, []);

  const requestEmptyTrash = useCallback(() => {
    setConfirmAction({ kind: "trash-empty" });
  }, []);

  const confirm = useCallback(async () => {
    if (!confirmAction) return;
    if (confirmAction.kind === "trash") {
      await moveItemToTrash(confirmAction.item);
    }
    if (confirmAction.kind === "permanent") {
      await permanentlyDeleteItem(confirmAction.item);
    }
    if (confirmAction.kind === "trash-empty") {
      await emptyTrash();
    }
    setConfirmAction(null);
  }, [confirmAction, emptyTrash, moveItemToTrash, permanentlyDeleteItem]);

  const cancel = useCallback(() => {
    setConfirmAction(null);
  }, []);

  const confirmDialogCopy = useMemo(() => {
    if (!confirmAction) return null;
    if (confirmAction.kind === "trash-empty") {
      return {
        title: "Empty trash?",
        description:
          "This will permanently remove all items in the trash. This action cannot be undone.",
        confirmLabel: "Empty Trash",
        tone: "danger" as const,
      };
    }
    if (confirmAction.kind === "permanent") {
      return {
        title: "Delete permanently?",
        description:
          "This will permanently remove the selected item. This action cannot be undone.",
        confirmLabel: "Delete",
        tone: "danger" as const,
      };
    }
    return {
      title: "Move to trash?",
      description: "The item will be moved to Trash and can be restored later.",
      confirmLabel: "Move to Trash",
      tone: "default" as const,
    };
  }, [confirmAction]);

  return {
    confirmAction,
    confirmDialogCopy,
    requestTrash,
    requestPermanentDelete,
    requestEmptyTrash,
    confirm,
    cancel,
    restoreItem,
  };
}
