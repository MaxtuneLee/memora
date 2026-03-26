import { DndContext, pointerWithin } from "@dnd-kit/core";
import { Tooltip } from "@base-ui/react/tooltip";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useStore } from "@livestore/react";

import { ConfirmDialog } from "./ConfirmDialog";
import { DesktopContextMenu } from "./DesktopContextMenu";
import { DesktopSurface } from "./DesktopSurface";
import { StorageWidget } from "./StorageWidget";
import { useTrashActions } from "@/hooks/desktop/useTrashActions";
import { useDesktopState } from "@/hooks/desktop/useDesktopState";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import {
  desktopAllFilesQuery$,
  desktopAllFoldersQuery$,
  desktopFilesQuery$,
  desktopFoldersQuery$,
} from "@/lib/desktop/queries";
import { fileEvents, type file as LiveStoreFile } from "@/livestore/file";
import { folderEvents } from "@/livestore/folder";
import type { DesktopItem as DesktopItemType, DesktopWidgetItem } from "@/types/desktop";
import { DESKTOP_PADDING, GRID_SIZE } from "@/types/desktop";
import type { RecordingMeta } from "@/types/library";
import type { PendingDesktopIntent } from "@/types/search";
import { DesktopWindowLayer } from "@/components/desktop/desktop/DesktopWindowLayer";
import { DesktopDropZone } from "@/components/desktop/desktop/DesktopDropZone";
import { useDesktopDnD } from "@/components/desktop/desktop/useDesktopDnD";
import { useDesktopExternalIntent } from "@/components/desktop/desktop/useDesktopExternalIntent";
import { useDesktopNativeDrop } from "@/components/desktop/desktop/useDesktopNativeDrop";
import { useDesktopSize } from "@/components/desktop/desktop/useDesktopSize";
import { useDesktopWindows } from "@/components/desktop/desktop/useDesktopWindows";
import { TRASH_ITEM_ID } from "@/components/desktop/desktop/types";
import {
  getColumnsForWidth,
  layoutDesktopItems,
  mapFileRowsToDesktopItems,
  mapFolderRowsToDesktopItems,
  sortDesktopItems,
} from "@/components/desktop/desktop/utils";

interface DesktopProps {
  externalIntent?: PendingDesktopIntent | null;
  onExternalIntentHandled?: (requestId: string) => void;
  onUploadFile: (parentId: string | null) => void;
  onNativeFileDrop?: (files: File[], parentId: string | null) => void;
  onDeleteFile: (file: RecordingMeta) => Promise<void>;
}

export function Desktop({
  externalIntent = null,
  onExternalIntentHandled,
  onUploadFile,
  onNativeFileDrop,
  onDeleteFile,
}: DesktopProps) {
  const { store } = useStore();
  const fileRows = store.useQuery(desktopFilesQuery$);
  const folderRows = store.useQuery(desktopFoldersQuery$);
  const allFileRows = store.useQuery(desktopAllFilesQuery$);
  const allFolderRows = store.useQuery(desktopAllFoldersQuery$);
  const containerRef = useRef<HTMLDivElement>(null);
  const [renamingIds, setRenamingIds] = useState<Set<string>>(new Set());
  const desktopSize = useDesktopSize(containerRef);

  const mapToMeta = useCallback((file: LiveStoreFile): RecordingMeta => {
    return mapLiveStoreFileToMeta(file);
  }, []);

  const fileItems = useMemo(() => {
    return mapFileRowsToDesktopItems(fileRows, mapToMeta);
  }, [fileRows, mapToMeta]);
  const folderItems = useMemo(() => {
    return mapFolderRowsToDesktopItems(folderRows);
  }, [folderRows]);
  const trashedFileItems = useMemo(() => {
    return mapFileRowsToDesktopItems(
      allFileRows.filter((file) => file.deletedAt && !file.purgedAt),
      mapToMeta,
    );
  }, [allFileRows, mapToMeta]);
  const trashedFolderItems = useMemo(() => {
    return mapFolderRowsToDesktopItems(
      allFolderRows.filter((folder) => folder.deletedAt && !folder.purgedAt),
    );
  }, [allFolderRows]);

  const trashItem = useMemo((): DesktopWidgetItem => {
    return {
      id: TRASH_ITEM_ID,
      name: "Trash",
      type: "widget",
      widgetType: "trash",
      position: { x: DESKTOP_PADDING, y: DESKTOP_PADDING },
      size: { width: GRID_SIZE, height: GRID_SIZE },
    } satisfies DesktopWidgetItem;
  }, []);

  const {
    items,
    selectedIds,
    contextMenu,
    selectItem,
    clearSelection,
    openContextMenu,
    closeContextMenu,
    setItems,
    removeItem,
  } = useDesktopState({ initialItems: [] });
  const {
    previewWindows,
    folderWindows,
    zIndexMap,
    focusedWindowId,
    openPreviewWindow,
    openFolderWindow,
    openTrashWindow,
    closePreviewWindow,
    focusPreviewWindow,
    movePreviewWindow,
    resizePreviewWindow,
    closeFolderWindow,
    focusFolderWindow,
    moveFolderWindow,
    resizeFolderWindow,
    toggleFolderView,
    navigateFolderWindow,
    replaceFolderWindowFolder,
  } = useDesktopWindows();
  const { activeDragId, sensors, handleDragStart, handleDragEnd } = useDesktopDnD({
    items,
    store,
  });
  const {
    nativeDragOver,
    handleNativeDragEnter,
    handleNativeDragOver,
    handleNativeDragLeave,
    handleNativeDrop,
  } = useDesktopNativeDrop({
    onNativeFileDrop,
  });

  useEffect(() => {
    setItems((previous) => {
      const next = new Map(previous);

      const mergeItem = (item: DesktopItemType) => {
        const existing = next.get(item.id);
        const position = existing?.position ?? { x: 0, y: 0 };
        next.set(item.id, {
          ...item,
          position,
          ...(item.type === "folder" ? { hasStoredPosition: false } : {}),
        } satisfies DesktopItemType);
      };

      fileItems.forEach(mergeItem);
      folderItems.forEach(mergeItem);
      mergeItem(trashItem);

      const fileIds = new Set(fileItems.map((item) => item.id));
      const folderIds = new Set(folderItems.map((item) => item.id));
      next.forEach((_, id) => {
        const existing = previous.get(id);
        if (existing?.type === "file" && !fileIds.has(id)) {
          next.delete(id);
        }
        if (existing?.type === "folder" && !folderIds.has(id)) {
          next.delete(id);
        }
      });

      return next;
    });
  }, [fileItems, folderItems, setItems, trashItem]);

  const itemsArray = useMemo(() => Array.from(items.values()), [items]);
  const rootItems = useMemo(() => {
    return itemsArray.filter((item) => {
      if (item.type === "file") return item.fileMeta.parentId === null;
      if (item.type === "folder") return item.parentId === null;
      return item.type === "widget";
    });
  }, [itemsArray]);
  const sortedRootLayout = useMemo(() => {
    return layoutDesktopItems(sortDesktopItems(rootItems), getColumnsForWidth(desktopSize.width));
  }, [desktopSize.width, rootItems]);

  const {
    confirmAction,
    confirmDialogCopy,
    requestTrash,
    requestPermanentDelete,
    requestEmptyTrash,
    confirm,
    cancel,
    restoreItem,
  } = useTrashActions({
    store,
    allFileRows,
    allFolderRows,
    trashedFileItems,
    trashedFolderItems,
    mapToMeta,
    onDeleteFile,
    removeItem,
  });

  const handleDesktopClick = useCallback(() => {
    clearSelection();
    if (contextMenu.isOpen) {
      closeContextMenu();
    }
  }, [clearSelection, closeContextMenu, contextMenu.isOpen]);

  const handleDesktopContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      openContextMenu({ x: event.clientX, y: event.clientY }, null, null, {
        left: rect.left,
        top: rect.top,
      });
    },
    [openContextMenu],
  );

  const handleItemContextMenu = useCallback(
    (
      event: MouseEvent,
      id: string | null,
      parentId: string | null = null,
      origin: { left: number; top: number } | null = null,
    ) => {
      openContextMenu({ x: event.clientX, y: event.clientY }, id, parentId, origin);
    },
    [openContextMenu],
  );

  const handleNewFolder = useCallback(
    (parentId: string | null = null) => {
      closeContextMenu();
      const id = crypto.randomUUID();
      store.commit(
        folderEvents.folderCreated({
          id,
          name: "New Folder",
          parentId,
          positionX: null,
          positionY: null,
          createdAt: new Date(),
        }),
      );
      setRenamingIds((previous) => new Set(previous).add(id));
    },
    [closeContextMenu, store],
  );

  const handleRename = useCallback(() => {
    closeContextMenu();
    const targetId = contextMenu.targetId;
    if (!targetId) {
      return;
    }
    const item = items.get(targetId);
    if (item?.type === "widget") {
      return;
    }
    setRenamingIds((previous) => new Set(previous).add(targetId));
  }, [closeContextMenu, contextMenu.targetId, items]);

  const handleRenameCommit = useCallback(
    (id: string, name: string) => {
      setRenamingIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
      const item = items.get(id);
      if (!item || item.type === "widget") {
        return;
      }
      if (item.type === "file") {
        store.commit(
          fileEvents.fileUpdated({
            id,
            name,
            updatedAt: new Date(),
          }),
        );
        return;
      }
      store.commit(
        folderEvents.folderUpdated({
          id,
          name,
          updatedAt: new Date(),
        }),
      );
    },
    [items, store],
  );

  const handleRenameCancel = useCallback((id: string) => {
    setRenamingIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  }, []);

  const handleUpload = useCallback(() => {
    closeContextMenu();
    onUploadFile(contextMenu.parentId ?? null);
  }, [closeContextMenu, contextMenu.parentId, onUploadFile]);

  const handleDelete = useCallback(() => {
    const targetId = contextMenu.targetId;
    closeContextMenu();
    if (!targetId) {
      return;
    }
    const item = items.get(targetId);
    if (!item || item.type === "widget") {
      return;
    }
    requestTrash(item);
  }, [closeContextMenu, contextMenu.targetId, items, requestTrash]);

  const handleOpenItem = useCallback(
    (item: DesktopItemType, activeFolderId?: string | null) => {
      if (item.type === "widget" && item.widgetType === "trash") {
        openTrashWindow();
        return;
      }
      if (item.type === "file") {
        openPreviewWindow(item.id);
        return;
      }
      if (activeFolderId !== undefined) {
        replaceFolderWindowFolder(activeFolderId, item.id);
        return;
      }
      openFolderWindow(item.id);
    },
    [openFolderWindow, openPreviewWindow, openTrashWindow, replaceFolderWindowFolder],
  );

  useDesktopExternalIntent({
    externalIntent,
    onExternalIntentHandled,
    onUploadFile,
    onOpenPreview: openPreviewWindow,
    onOpenFolder: openFolderWindow,
    onNewFolder: handleNewFolder,
    onOpenTrash: openTrashWindow,
  });

  return (
    <Tooltip.Provider>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <DesktopDropZone
          ref={containerRef}
          className="relative h-full w-full overflow-auto bg-gradient-to-br from-zinc-50 via-zinc-100/50 to-zinc-100"
          onClick={handleDesktopClick}
          onContextMenu={handleDesktopContextMenu}
          onDragEnter={handleNativeDragEnter}
          onDragOver={handleNativeDragOver}
          onDragLeave={handleNativeDragLeave}
          onDrop={(event) => handleNativeDrop(event, null)}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(to right, currentColor 1px, transparent 1px),
                linear-gradient(to bottom, currentColor 1px, transparent 1px)
              `,
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
            }}
          />

          <DesktopSurface
            items={sortedRootLayout}
            layout="desktop"
            enableDnD
            selectedIds={selectedIds}
            renamingIds={renamingIds}
            onSelect={selectItem}
            onContextMenu={handleItemContextMenu}
            onOpenItem={handleOpenItem}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={handleRenameCancel}
            contextMenuTargetId={null}
            contextMenuParentId={null}
          />

          <StorageWidget />

          <DesktopContextMenu
            isOpen={contextMenu.isOpen}
            position={contextMenu.position}
            targetId={contextMenu.targetId}
            targetType={
              contextMenu.targetId ? (items.get(contextMenu.targetId)?.type ?? null) : null
            }
            onClose={closeContextMenu}
            onNewFolder={() => handleNewFolder(contextMenu.parentId ?? null)}
            onNewNote={() => closeContextMenu()}
            onUploadAudio={handleUpload}
            onRename={handleRename}
            onDelete={handleDelete}
            onOpenInNewWindow={
              contextMenu.targetId && items.get(contextMenu.targetId)?.type === "folder"
                ? () => {
                    closeContextMenu();
                    openFolderWindow(contextMenu.targetId);
                  }
                : undefined
            }
          />

          <DesktopWindowLayer
            previewWindows={previewWindows}
            folderWindows={folderWindows}
            items={items}
            itemsArray={itemsArray}
            selectedIds={selectedIds}
            renamingIds={renamingIds}
            zIndexMap={zIndexMap}
            focusedWindowId={focusedWindowId}
            containerRef={containerRef}
            allFolders={folderRows}
            trashedFileItems={trashedFileItems}
            trashedFolderItems={trashedFolderItems}
            activeDragId={activeDragId}
            onClosePreview={closePreviewWindow}
            onFocusPreview={focusPreviewWindow}
            onMovePreview={movePreviewWindow}
            onResizePreview={resizePreviewWindow}
            onCloseFolder={closeFolderWindow}
            onFocusFolder={focusFolderWindow}
            onMoveFolder={moveFolderWindow}
            onResizeFolder={resizeFolderWindow}
            onToggleFolderView={toggleFolderView}
            onOpenBreadcrumb={navigateFolderWindow}
            onOpenItem={handleOpenItem}
            onContextMenu={handleItemContextMenu}
            onSelectItem={selectItem}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={handleRenameCancel}
            onNativeFileDrop={onNativeFileDrop}
            onRestoreItem={restoreItem}
            onDeletePermanently={requestPermanentDelete}
            onEmptyTrash={requestEmptyTrash}
          />

          {nativeDragOver && (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-blue-50/60 backdrop-blur-[2px]">
              <div className="rounded-2xl border-2 border-dashed border-blue-400 bg-white/80 px-8 py-6 shadow-lg">
                <p className="text-sm font-medium text-blue-600">Drop files here to upload</p>
              </div>
            </div>
          )}

          <ConfirmDialog
            isOpen={confirmAction !== null}
            title={confirmDialogCopy?.title ?? ""}
            description={confirmDialogCopy?.description ?? ""}
            confirmLabel={confirmDialogCopy?.confirmLabel ?? "Confirm"}
            tone={confirmDialogCopy?.tone ?? "default"}
            onConfirm={confirm}
            onCancel={cancel}
          />
        </DesktopDropZone>
      </DndContext>
    </Tooltip.Provider>
  );
}
