import { RowsIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { useDroppable } from "@dnd-kit/core";
import { useCallback, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import type { DesktopItem as DesktopItemData } from "@/types/desktop";
import type { DesktopWindowPosition, DesktopWindowSize } from "./DesktopWindow";
import { DesktopWindow } from "./DesktopWindow";
import { DesktopSurface } from "./DesktopSurface";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  dragOver: {
    backgroundColor: tokens.selected,
    boxShadow: `inset 0 0 0 2px ${tokens.oliveSoft}`,
  },
  windowBody: { display: "flex", flexDirection: "column", height: "100%" },
  toolbar: {
    alignItems: "center",
    borderBottom: `1px solid ${tokens.border}`,
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 8,
    paddingInline: 12,
  },
  breadcrumbs: {
    alignItems: "center",
    color: tokens.textMuted,
    display: "flex",
    fontSize: "0.75rem",
    gap: 4,
  },
  breadcrumb: { color: tokens.textMuted, ":hover": { color: tokens.text } },
  activeBreadcrumb: { color: tokens.text, fontWeight: 500 },
  separator: { color: tokens.textSoft, marginInline: 4 },
  viewSwitcher: {
    alignItems: "center",
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    display: "flex",
    gap: 4,
    padding: 4,
  },
  viewButton: {
    alignItems: "center",
    borderRadius: 6,
    color: tokens.textMuted,
    display: "flex",
    height: 28,
    justifyContent: "center",
    transition: "background-color 150ms, color 150ms",
    width: 28,
    ":hover": { backgroundColor: tokens.hover },
  },
  activeViewButton: {
    backgroundColor: tokens.primaryBackground,
    color: tokens.primaryText,
    ":hover": { backgroundColor: tokens.primaryBackground },
  },
  viewIcon: { height: 16, width: 16 },
  content: { backgroundColor: tokens.surfaceSoft, flex: 1, overflow: "auto" },
});

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
      className={`${className ?? ""} ${isOver ? stylex.props(styles.dragOver).className : ""}`}
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
      <div {...stylex.props(styles.windowBody)}>
        <div {...stylex.props(styles.toolbar)}>
          <div {...stylex.props(styles.breadcrumbs)}>
            {breadcrumbItems
              .map((crumb, index) => (
                <button
                  key={`${crumb.id ?? "root"}-${index}`}
                  type="button"
                  onClick={() => onOpenBreadcrumb(crumb.id)}
                  {...stylex.props(
                    styles.breadcrumb,
                    index === breadcrumbItems.length - 1 && styles.activeBreadcrumb,
                  )}
                >
                  {crumb.name}
                </button>
              ))
              .reduce<React.ReactNode[]>((acc, node, idx) => {
                if (idx > 0) {
                  acc.push(
                    <span key={`sep-${idx}`} {...stylex.props(styles.separator)}>
                      /
                    </span>,
                  );
                }
                acc.push(node);
                return acc;
              }, [])}
          </div>
          <div {...stylex.props(styles.viewSwitcher)}>
            <button
              type="button"
              onClick={() => onToggleView(id, "grid")}
              {...stylex.props(styles.viewButton, viewMode === "grid" && styles.activeViewButton)}
              aria-label="Grid view"
            >
              <SquaresFourIcon {...stylex.props(styles.viewIcon)} />
            </button>
            <button
              type="button"
              onClick={() => onToggleView(id, "list")}
              {...stylex.props(styles.viewButton, viewMode === "list" && styles.activeViewButton)}
              aria-label="List view"
            >
              <RowsIcon {...stylex.props(styles.viewIcon)} />
            </button>
          </div>
        </div>

        <FolderWindowDropZone
          folderId={folderId}
          className={stylex.props(styles.content, nativeDragOver && styles.dragOver).className}
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
