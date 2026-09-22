import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FileTextIcon, FolderIcon, TrashIcon } from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { getFileIcon } from "@/lib/library/fileIcon";
import type { DesktopItem as DesktopItemData } from "@/types/desktop";
import { GRID_SIZE, ICON_SIZE } from "@/types/desktop";
import { DesktopFileTip } from "./DesktopFileTip";
import { areDesktopItemsEqual } from "./desktop/utils";
import { DesktopIndexStatusIcon } from "./DesktopIndexStatus";
import { tokens } from "../../styles/stylex.stylex";
import type { JSX } from "react";

const styles = stylex.create({
  // Folder icon color is a content-type brand color, not a semantic one; kept fixed like
  // tokens.contentAudio/contentVideo/contentImage.
  folderIcon: { color: "#3b82f6", height: 40, width: 40 },
  trashIcon: { color: tokens.dangerText, height: 36, width: 36 },
  fileIcon: { color: tokens.textMuted, height: 32, width: 32 },
  item: {
    outline: "none",
    transition: "background-color 150ms",
    userSelect: "none",
  },
  listItem: {
    alignItems: "center",
    borderRadius: 8,
    display: "flex",
    gap: 12,
    paddingBlock: 8,
    paddingInline: 12,
    width: "100%",
  },
  desktopItem: {
    alignItems: "center",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 8,
  },
  listSelected: { backgroundColor: tokens.selected },
  listIdle: { ":hover": { backgroundColor: tokens.hoverStrong } },
  desktopSelected: { backgroundColor: tokens.selected },
  desktopIdle: { ":hover": { backgroundColor: tokens.hover } },
  dragging: { boxShadow: tokens.shadowMedium, outline: `2px solid ${tokens.borderStrong}` },
  overFolder: {
    backgroundColor: tokens.selected,
    outline: `2px solid ${tokens.oliveSoft}`,
  },
  iconSurface: {
    alignItems: "center",
    backgroundColor: tokens.surface,
    borderRadius: 12,
    boxShadow: tokens.shadowSmall,
    display: "flex",
    justifyContent: "center",
    outline: `1px solid ${tokens.borderSoft}`,
    position: "relative",
    transition: "transform 150ms",
  },
  iconHovered: { transform: "scale(1.05)" },
  iconSelected: { boxShadow: tokens.shadowMedium, outlineColor: tokens.borderStrong },
  listRenameInput: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textStrong,
    flex: 1,
    fontSize: "0.875rem",
    outline: "none",
    paddingBlock: 4,
    paddingInline: 8,
    ":focus": { borderColor: tokens.focusRing },
  },
  desktopRenameInput: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textStrong,
    fontSize: "0.75rem",
    fontWeight: 500,
    outline: "none",
    paddingBlock: 4,
    paddingInline: 8,
    textAlign: "center",
    width: 88,
    ":focus": { borderColor: tokens.focusRing },
  },
  listName: {
    flex: 1,
    // Flex items default to min-width: auto, which blocks shrinking below the text's natural
    // width; without this, a long unbroken name overflows the row instead of truncating.
    minWidth: 0,
    fontSize: "0.875rem",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  desktopName: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    display: "-webkit-box",
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "1.25",
    maxWidth: 80,
    overflow: "hidden",
    overflowWrap: "break-word",
    textAlign: "center",
  },
  selectedName: { color: tokens.textStrong },
  idleName: { color: tokens.text },
});

interface DesktopItemProps {
  item: DesktopItemData;
  isSelected: boolean;
  onSelect: (id: string, addToSelection: boolean) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onOpenItem: (item: DesktopItemData) => void;
  layout?: "desktop" | "grid" | "list";
  draggable?: boolean;
  showFileIndexStatus?: boolean;
  isRenaming?: boolean;
  onRenameCommit?: (id: string, name: string) => void;
  onRenameCancel?: (id: string) => void;
}

function DesktopItemComponent({
  item,
  isSelected,
  onSelect,
  onContextMenu,
  onOpenItem,
  layout = "desktop",
  draggable = true,
  showFileIndexStatus = true,
  isRenaming = false,
  onRenameCommit,
  onRenameCancel,
}: DesktopItemProps) {
  const wasDraggingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.value = item.name;
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isRenaming, item.name]);

  const isAbsoluteLayout = layout === "desktop" || layout === "grid";
  const isListLayout = layout === "list";
  const allowDrag = isAbsoluteLayout && draggable && !isRenaming;
  const allowDrop = item.type === "folder";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !allowDrag,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: item.id,
    disabled: !allowDrop,
  });

  useEffect(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
    }
  }, [isDragging]);

  const style: React.CSSProperties = isAbsoluteLayout
    ? {
        position: "absolute",
        left: item.position.x,
        top: item.position.y,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        width: GRID_SIZE,
        zIndex: isDragging ? 12 : isSelected ? 3 : 1,
        cursor: isDragging ? "grabbing" : "default",
        opacity: isDragging ? 0 : 1,
      }
    : {
        position: "relative",
        zIndex: isSelected ? 3 : 1,
        cursor: "default",
        opacity: isDragging ? 0 : 1,
      };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Reset drag tracking after a short delay (after drag end processing)
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }

    onSelect(item.id, e.metaKey || e.ctrlKey);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.type === "widget") return;
    onContextMenu(e, item.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't preview if we just finished dragging
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }

    onOpenItem(item);
  };

  const handleRenameSubmit = useCallback(() => {
    const trimmed = (inputRef.current?.value ?? "").trim();
    if (!trimmed) {
      onRenameCancel?.(item.id);
      if (inputRef.current) inputRef.current.value = item.name;
      return;
    }
    onRenameCommit?.(item.id, trimmed);
  }, [item.id, item.name, onRenameCancel, onRenameCommit]);

  const getIcon = (): JSX.Element => {
    if (item.type === "folder") {
      return <FolderIcon {...stylex.props(styles.folderIcon)} weight="duotone" />;
    }
    if (item.type === "widget" && item.widgetType === "trash") {
      return <TrashIcon {...stylex.props(styles.trashIcon)} weight="duotone" />;
    }
    if (item.type === "file") {
      const Icon = getFileIcon(item.fileMeta);
      return <Icon {...stylex.props(styles.fileIcon)} weight="duotone" />;
    }
    // Widget icons handled separately
    return <FileTextIcon {...stylex.props(styles.fileIcon)} weight="duotone" />;
  };

  // Only show tooltip for files and folders
  const showTooltip = (item.type === "file" || item.type === "folder") && !isRenaming;

  const itemContent = (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (allowDrop) {
          setDropRef(node);
        }
      }}
      style={style}
      {...listeners}
      {...attributes}
      {...stylex.props(
        styles.item,
        isListLayout ? styles.listItem : styles.desktopItem,
        isListLayout
          ? isSelected
            ? styles.listSelected
            : styles.listIdle
          : isSelected
            ? styles.desktopSelected
            : styles.desktopIdle,
        isDragging && styles.dragging,
        isOver && styles.overFolder,
      )}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        {...stylex.props(
          styles.iconSurface,
          isHovered && styles.iconHovered,
          isSelected && styles.iconSelected,
        )}
        style={{ width: isListLayout ? 40 : ICON_SIZE, height: isListLayout ? 40 : ICON_SIZE }}
      >
        {getIcon()}
        {item.type === "file" && showFileIndexStatus ? (
          <DesktopIndexStatusIcon
            status={item.indexState.status}
            compact={isListLayout}
            onOpenDetails={() => onOpenItem(item)}
          />
        ) : null}
      </div>
      {isRenaming ? (
        <input
          ref={inputRef}
          defaultValue={item.name}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleRenameSubmit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onRenameCancel?.(item.id);
              if (inputRef.current) inputRef.current.value = item.name;
            }
          }}
          {...stylex.props(isListLayout ? styles.listRenameInput : styles.desktopRenameInput)}
        />
      ) : (
        <span
          {...stylex.props(
            isListLayout ? styles.listName : styles.desktopName,
            isSelected ? styles.selectedName : styles.idleName,
          )}
        >
          {item.name}
        </span>
      )}
    </div>
  );

  if (showTooltip) {
    return <DesktopFileTip item={item}>{itemContent}</DesktopFileTip>;
  }

  return itemContent;
}

export const DesktopItem = memo(
  DesktopItemComponent,
  (previous, next) =>
    areDesktopItemsEqual(previous.item, next.item) &&
    previous.isSelected === next.isSelected &&
    previous.onSelect === next.onSelect &&
    previous.onContextMenu === next.onContextMenu &&
    previous.onOpenItem === next.onOpenItem &&
    previous.layout === next.layout &&
    previous.draggable === next.draggable &&
    previous.showFileIndexStatus === next.showFileIndexStatus &&
    previous.isRenaming === next.isRenaming &&
    previous.onRenameCommit === next.onRenameCommit &&
    previous.onRenameCancel === next.onRenameCancel,
);

DesktopItem.displayName = "DesktopItem";
