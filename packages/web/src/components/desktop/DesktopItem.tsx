import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  MicrophoneIcon,
  TrashIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import type { DesktopItem as DesktopItemData } from "@/types/desktop";
import { GRID_SIZE, ICON_SIZE } from "@/types/desktop";
import { DesktopFileTip } from "./DesktopFileTip";
import type { JSX } from "react";

interface DesktopItemProps {
  item: DesktopItemData;
  isSelected: boolean;
  onSelect: (id: string, addToSelection: boolean) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onOpenItem: (item: DesktopItemData) => void;
  layout?: "desktop" | "grid" | "list";
  draggable?: boolean;
  isRenaming?: boolean;
  onRenameCommit?: (id: string, name: string) => void;
  onRenameCancel?: (id: string) => void;
}

const FILE_TYPE_ICONS: Record<string, JSX.Element> = {
  audio: <MicrophoneIcon className="size-8 text-zinc-500" weight="duotone" />,
  video: <VideoCameraIcon className="size-8 text-zinc-500" weight="duotone" />,
  image: <ImageIcon className="size-8 text-zinc-500" weight="duotone" />,
  document: <FileTextIcon className="size-8 text-zinc-500" weight="duotone" />,
};

export function DesktopItem({
  item,
  isSelected,
  onSelect,
  onContextMenu,
  onOpenItem,
  layout = "desktop",
  draggable = true,
  isRenaming = false,
  onRenameCommit,
  onRenameCancel,
}: DesktopItemProps) {
  const wasDraggingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      return <FolderIcon className="size-10 text-blue-500" weight="duotone" />;
    }
    if (item.type === "widget" && item.widgetType === "trash") {
      return <TrashIcon className="size-9 text-red-500" weight="duotone" />;
    }
    if (item.type === "file") {
      return (
        FILE_TYPE_ICONS[item.fileMeta.type] ?? (
          <FileTextIcon className="size-8 text-zinc-500" weight="duotone" />
        )
      );
    }
    // Widget icons handled separately
    return <FileTextIcon className="size-8 text-zinc-500" weight="duotone" />;
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
      className={
        isListLayout
          ? `
            group flex w-full items-center gap-3 rounded-lg px-3 py-2
            transition-colors select-none outline-none
            ${isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"}
          `
          : `
            group flex flex-col items-center gap-1.5 p-2 rounded-lg
            transition-colors select-none outline-none
            ${isSelected ? "bg-zinc-200/80" : "hover:bg-zinc-100/60"}
            ${isDragging ? "shadow-lg ring-2 ring-zinc-300" : ""}
            ${isOver ? "ring-2 ring-blue-400/70 bg-blue-50/60" : ""}
          `
      }
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className={`
          flex items-center justify-center rounded-xl bg-white/80
          shadow-sm ring-1 ring-zinc-900/5 backdrop-blur-sm
          transition-transform group-hover:scale-105
          ${isSelected ? "ring-zinc-400 shadow-md" : ""}
        `}
        style={{ width: isListLayout ? 40 : ICON_SIZE, height: isListLayout ? 40 : ICON_SIZE }}
      >
        {getIcon()}
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
          className={
            isListLayout
              ? "flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-400"
              : "w-[88px] rounded-md border border-zinc-200 bg-white px-2 py-1 text-center text-xs font-medium text-zinc-900 outline-none focus:border-zinc-400"
          }
        />
      ) : (
        <span
          className={
            isListLayout
              ? `
                flex-1 truncate text-sm font-medium
                ${isSelected ? "text-zinc-900" : "text-zinc-700"}
              `
              : `
                max-w-[80px] text-center text-xs font-medium leading-tight
                line-clamp-2 break-words
                ${isSelected ? "text-zinc-900" : "text-zinc-700"}
              `
          }
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
