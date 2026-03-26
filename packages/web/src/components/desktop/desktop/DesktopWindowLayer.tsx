import { DragOverlay } from "@dnd-kit/core";
import type { RefObject } from "react";
import type { MouseEvent } from "react";

import { DesktopFolderWindow } from "@/components/desktop/DesktopFolderWindow";
import { DesktopItem } from "@/components/desktop/DesktopItem";
import { DesktopPreviewWindow } from "@/components/desktop/DesktopPreviewWindow";
import { TrashWindow } from "@/components/desktop/TrashWindow";
import type {
  DesktopFileItem,
  DesktopFolderItem,
  DesktopItem as DesktopItemType,
} from "@/types/desktop";
import type { folder as LiveStoreFolder } from "@/livestore/folder";

import {
  TRASH_WINDOW_ID,
  WINDOW_Z_BASE,
  type FolderWindowState,
  type PreviewWindowState,
} from "./types";
import {
  getColumnsForWidth,
  getDesktopBreadcrumbs,
  layoutDesktopItems,
  sortDesktopItems,
} from "./utils";

interface DesktopWindowLayerProps {
  previewWindows: PreviewWindowState[];
  folderWindows: FolderWindowState[];
  items: Map<string, DesktopItemType>;
  itemsArray: DesktopItemType[];
  selectedIds: Set<string>;
  renamingIds: Set<string>;
  zIndexMap: Map<string, number>;
  focusedWindowId: string | null;
  containerRef: RefObject<HTMLDivElement | null>;
  allFolders: readonly LiveStoreFolder[];
  trashedFileItems: DesktopFileItem[];
  trashedFolderItems: DesktopFolderItem[];
  activeDragId: string | null;
  onClosePreview: (id: string) => void;
  onFocusPreview: (id: string) => void;
  onMovePreview: (id: string, position: { x: number; y: number }) => void;
  onResizePreview: (id: string, size: { width: number; height: number }) => void;
  onCloseFolder: (id: string) => void;
  onFocusFolder: (id: string) => void;
  onMoveFolder: (id: string, position: { x: number; y: number }) => void;
  onResizeFolder: (id: string, size: { width: number; height: number }) => void;
  onToggleFolderView: (id: string, mode: "grid" | "list") => void;
  onOpenBreadcrumb: (windowId: string, folderId: string | null) => void;
  onOpenItem: (item: DesktopItemType, activeFolderId?: string | null) => void;
  onContextMenu: (
    event: MouseEvent,
    id: string | null,
    parentId?: string | null,
    origin?: { left: number; top: number } | null,
  ) => void;
  onSelectItem: (id: string, multi?: boolean) => void;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: (id: string) => void;
  onNativeFileDrop?: (files: File[], parentId: string | null) => void;
  onRestoreItem: (item: DesktopItemType) => void;
  onDeletePermanently: (item: DesktopItemType) => void;
  onEmptyTrash: () => void;
}

export const DesktopWindowLayer = ({
  previewWindows,
  folderWindows,
  items,
  itemsArray,
  selectedIds,
  renamingIds,
  zIndexMap,
  focusedWindowId,
  containerRef,
  allFolders,
  trashedFileItems,
  trashedFolderItems,
  activeDragId,
  onClosePreview,
  onFocusPreview,
  onMovePreview,
  onResizePreview,
  onCloseFolder,
  onFocusFolder,
  onMoveFolder,
  onResizeFolder,
  onToggleFolderView,
  onOpenBreadcrumb,
  onOpenItem,
  onContextMenu,
  onSelectItem,
  onRenameCommit,
  onRenameCancel,
  onNativeFileDrop,
  onRestoreItem,
  onDeletePermanently,
  onEmptyTrash,
}: DesktopWindowLayerProps) => {
  return (
    <>
      {previewWindows.map((window) => {
        const item = items.get(window.fileId);
        if (!item || (item.type !== "file" && item.type !== "folder")) {
          return null;
        }

        const zIndex = zIndexMap.get(window.id) ?? WINDOW_Z_BASE;
        return (
          <DesktopPreviewWindow
            key={window.id}
            id={window.id}
            item={item}
            position={window.position}
            size={window.size}
            zIndex={zIndex}
            isFocused={window.id === focusedWindowId}
            boundsRef={containerRef}
            onClose={onClosePreview}
            onFocus={onFocusPreview}
            onMove={onMovePreview}
            onResize={onResizePreview}
          />
        );
      })}

      {folderWindows.map((window) => {
        const isTrashWindow = window.id === TRASH_WINDOW_ID;
        const isRootWindow = window.folderId === null && !isTrashWindow;
        const folderItem = isRootWindow ? null : items.get(window.folderId ?? "");
        if (!isRootWindow && !isTrashWindow && (!folderItem || folderItem.type !== "folder")) {
          return null;
        }

        const zIndex = zIndexMap.get(window.id) ?? WINDOW_Z_BASE;
        const folderContents = isTrashWindow
          ? sortDesktopItems([...trashedFolderItems, ...trashedFileItems])
          : sortDesktopItems(
              itemsArray.filter((item) => {
                if (item.type === "file") return item.fileMeta.parentId === window.folderId;
                if (item.type === "folder") return item.parentId === window.folderId;
                return false;
              }),
            );

        const title = isTrashWindow
          ? "Trash"
          : isRootWindow
            ? "Desktop"
            : folderItem?.type === "folder"
              ? folderItem.name
              : "Folder";

        if (isTrashWindow) {
          return (
            <TrashWindow
              key={window.id}
              id={window.id}
              title={title}
              items={folderContents}
              position={window.position}
              size={window.size}
              zIndex={zIndex}
              isFocused={window.id === focusedWindowId}
              boundsRef={containerRef}
              onClose={onCloseFolder}
              onFocus={onFocusFolder}
              onMove={onMoveFolder}
              onResize={onResizeFolder}
              onRestore={onRestoreItem}
              onDeletePermanently={onDeletePermanently}
              onEmptyTrash={onEmptyTrash}
              selectedIds={selectedIds}
              renamingIds={renamingIds}
              onSelectItem={onSelectItem}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          );
        }

        const visibleItems =
          window.viewMode === "grid"
            ? layoutDesktopItems(folderContents, getColumnsForWidth(window.size.width))
            : folderContents;

        return (
          <DesktopFolderWindow
            key={window.id}
            id={window.id}
            folderId={window.folderId}
            title={title}
            items={visibleItems}
            breadcrumbItems={getDesktopBreadcrumbs(allFolders, window.folderId)}
            position={window.position}
            size={window.size}
            zIndex={zIndex}
            isFocused={window.id === focusedWindowId}
            viewMode={window.viewMode}
            boundsRef={containerRef}
            renamingIds={renamingIds}
            onToggleView={onToggleFolderView}
            onOpenBreadcrumb={(folderId) => onOpenBreadcrumb(window.id, folderId)}
            onClose={onCloseFolder}
            onFocus={onFocusFolder}
            onMove={onMoveFolder}
            onResize={onResizeFolder}
            onOpenItem={onOpenItem}
            onContextMenu={onContextMenu}
            onSelectItem={onSelectItem}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
            onNativeFileDrop={onNativeFileDrop}
          />
        );
      })}

      <DragOverlay dropAnimation={null}>
        {activeDragId
          ? (() => {
              const dragItem = items.get(activeDragId);
              if (!dragItem) {
                return null;
              }

              return (
                <DesktopItem
                  item={dragItem}
                  isSelected
                  onSelect={() => {}}
                  onContextMenu={() => {}}
                  onOpenItem={() => {}}
                  layout="grid"
                  draggable={false}
                />
              );
            })()
          : null}
      </DragOverlay>
    </>
  );
};
