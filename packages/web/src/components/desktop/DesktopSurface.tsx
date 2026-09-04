import { useMemo } from "react";
import type { DesktopItem as DesktopItemData } from "@/types/desktop";
import { DESKTOP_PADDING } from "@/types/desktop";
import { DesktopItem } from "./DesktopItem";

interface DesktopSurfaceProps {
  items: DesktopItemData[];
  layout: "desktop" | "grid" | "list";
  enableDnD: boolean;
  showFileIndexStatus?: boolean;
  selectedIds: Set<string>;
  renamingIds: Set<string>;
  onSelect: (id: string, addToSelection: boolean) => void;
  onContextMenu: (
    e: React.MouseEvent,
    id: string | null,
    parentId?: string | null,
    origin?: { left: number; top: number } | null,
  ) => void;
  onOpenItem: (item: DesktopItemData) => void;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: (id: string) => void;
  contextMenuTargetId?: string | null;
  contextMenuParentId?: string | null;
}

export function DesktopSurface({
  items,
  layout,
  enableDnD,
  showFileIndexStatus = true,
  selectedIds,
  renamingIds,
  onSelect,
  onContextMenu,
  onOpenItem,
  onRenameCommit,
  onRenameCancel,
  contextMenuTargetId = null,
  contextMenuParentId = null,
}: DesktopSurfaceProps) {
  const sortedItems = useMemo(() => items, [items]);

  const content = (
    <div
      className={layout === "list" ? "flex flex-col gap-1 p-3" : "relative min-h-full"}
      style={layout === "list" ? undefined : { padding: DESKTOP_PADDING }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onContextMenu(event, contextMenuTargetId, contextMenuParentId, {
          left: rect.left,
          top: rect.top,
        });
      }}
    >
      {sortedItems.map((item) => (
        <DesktopItem
          key={item.id}
          item={item}
          isSelected={selectedIds.has(item.id)}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onOpenItem={onOpenItem}
          layout={layout === "desktop" ? "desktop" : layout}
          draggable={enableDnD && item.type !== "widget"}
          showFileIndexStatus={showFileIndexStatus}
          isRenaming={renamingIds.has(item.id)}
          onRenameCommit={renamingIds.has(item.id) ? onRenameCommit : undefined}
          onRenameCancel={renamingIds.has(item.id) ? onRenameCancel : undefined}
        />
      ))}
    </div>
  );

  return content;
}
