import {
  RowsIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { useDroppable } from "@dnd-kit/core";
import { useCallback, useRef, useState } from "react";
import type { DesktopItem as DesktopItemData } from "./desktopTypes";
import type { DesktopWindowPosition, DesktopWindowSize } from "./DesktopWindow";
import { DesktopWindow } from "./DesktopWindow";
import { DesktopSurface } from "./DesktopSurface";

export const FOLDER_WINDOW_DROP_PREFIX = "folder-window:";

function FolderWindowDropZone({
  folderId,
  className,
  children,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  folderId: string | null;
  className?: string;
  children: React.ReactNode;
  onDragEnter?: React.DragEventHandler;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
}) {
  const droppableId = folderId ? `${FOLDER_WINDOW_DROP_PREFIX}${folderId}` : null;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId ?? "folder-window:root",
    disabled: !droppableId,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-inset ring-blue-400/70 bg-blue-50/30" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}

interface DesktopFolderWindowProps {
  id: string;
  folderId: string | null;
  title: string;
  items: DesktopItemData[];
  breadcrumbItems: { id: string | null; name: string }[];
  position: DesktopWindowPosition;
  size: DesktopWindowSize;
  zIndex: number;
  isFocused: boolean;
  viewMode: "grid" | "list";
  boundsRef: React.RefObject<HTMLDivElement | null>;
  renamingIds: Set<string>;
  onToggleView: (id: string, mode: "grid" | "list") => void;
  onOpenBreadcrumb: (id: string | null) => void;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onMove: (id: string, position: DesktopWindowPosition) => void;
  onResize: (id: string, size: DesktopWindowSize) => void;
  onOpenItem: (item: DesktopItemData, activeFolderId: string | null) => void;
  onContextMenu: (
    e: React.MouseEvent,
    id: string | null,
    parentId?: string | null,
    origin?: { left: number; top: number } | null,
  ) => void;
  onSelectItem: (id: string, addToSelection: boolean) => void;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: (id: string) => void;
  onNativeFileDrop?: (files: File[], parentId: string | null) => void;
}

export function DesktopFolderWindow({
  id,
  folderId,
  title,
  items,
  breadcrumbItems,
  position,
  size,
  zIndex,
  isFocused,
  viewMode,
  boundsRef,
  renamingIds,
  onToggleView,
  onOpenBreadcrumb,
  onClose,
  onFocus,
  onMove,
  onResize,
  onOpenItem,
  onContextMenu,
  onSelectItem,
  onRenameCommit,
  onRenameCancel,
  onNativeFileDrop,
}: DesktopFolderWindowProps) {
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set());
  const [nativeDragOver, setNativeDragOver] = useState(false);
  const nativeDragCounterRef = useRef(0);

  const handleSelect = useCallback(
    (itemId: string, addToSelection: boolean) => {
      setLocalSelection((prev) => {
        if (addToSelection) {
          const next = new Set(prev);
          if (next.has(itemId)) {
            next.delete(itemId);
          } else {
            next.add(itemId);
          }
          return next;
        }
        return new Set([itemId]);
      });
      onSelectItem(itemId, addToSelection);
    },
    [onSelectItem],
  );

  const handleFolderNativeDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    nativeDragCounterRef.current += 1;
    setNativeDragOver(true);
  }, []);

  const handleFolderNativeDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleFolderNativeDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    nativeDragCounterRef.current -= 1;
    if (nativeDragCounterRef.current <= 0) {
      nativeDragCounterRef.current = 0;
      setNativeDragOver(false);
    }
  }, []);

  const handleFolderNativeDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      nativeDragCounterRef.current = 0;
      setNativeDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0 && onNativeFileDrop) {
        onNativeFileDrop(files, folderId);
      }
    },
    [folderId, onNativeFileDrop],
  );

  return (
    <DesktopWindow
      id={id}
      title={title}
      position={position}
      size={size}
      zIndex={zIndex}
      isFocused={isFocused}
      boundsRef={boundsRef}
      onClose={onClose}
      onFocus={onFocus}
      onMove={onMove}
      onResize={onResize}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            {breadcrumbItems.map((crumb, index) => (
              <button
                key={`${crumb.id ?? "root"}-${index}`}
                type="button"
                onClick={() => onOpenBreadcrumb(crumb.id)}
                className={
                  index === breadcrumbItems.length - 1
                    ? "text-zinc-700 font-medium"
                    : "text-zinc-500 hover:text-zinc-700"
                }
              >
                {crumb.name}
              </button>
            )).reduce<React.ReactNode[]>((acc, node, idx) => {
              if (idx > 0) {
                acc.push(
                  <span key={`sep-${idx}`} className="mx-1 text-zinc-300">
                    /
                  </span>,
                );
              }
              acc.push(node);
              return acc;
            }, [])}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1">
            <button
              type="button"
              onClick={() => onToggleView(id, "grid")}
              className={`flex size-7 items-center justify-center rounded-md transition ${
                viewMode === "grid"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
              aria-label="Grid view"
            >
              <SquaresFourIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleView(id, "list")}
              className={`flex size-7 items-center justify-center rounded-md transition ${
                viewMode === "list"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
              aria-label="List view"
            >
              <RowsIcon className="size-4" />
            </button>
          </div>
        </div>

        <FolderWindowDropZone
          folderId={folderId}
          className={`flex-1 overflow-auto bg-zinc-50/70 ${nativeDragOver ? "ring-2 ring-inset ring-blue-400/70 bg-blue-50/30" : ""}`}
          onDragEnter={handleFolderNativeDragEnter}
          onDragOver={handleFolderNativeDragOver}
          onDragLeave={handleFolderNativeDragLeave}
          onDrop={handleFolderNativeDrop}
        >
          <DesktopSurface
            items={items}
            layout={viewMode}
            enableDnD
            selectedIds={localSelection}
            renamingIds={renamingIds}
            onSelect={handleSelect}
            onContextMenu={onContextMenu}
            onOpenItem={(item) => onOpenItem(item, folderId)}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
            contextMenuTargetId={null}
            contextMenuParentId={folderId}
          />
        </FolderWindowDropZone>
      </div>
    </DesktopWindow>
  );
}
