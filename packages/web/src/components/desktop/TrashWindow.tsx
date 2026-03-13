import { useCallback, useMemo, useState } from "react";
import type { DesktopItem as DesktopItemData } from "@/types/desktop";
import type { DesktopWindowPosition, DesktopWindowSize } from "./DesktopWindow";
import { DesktopWindow } from "./DesktopWindow";
import { DesktopSurface } from "./DesktopSurface";

interface TrashWindowProps {
  id: string;
  title: string;
  items: DesktopItemData[];
  position: DesktopWindowPosition;
  size: DesktopWindowSize;
  zIndex: number;
  isFocused: boolean;
  boundsRef: React.RefObject<HTMLDivElement | null>;
  selectedIds: Set<string>;
  renamingIds: Set<string>;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onMove: (id: string, position: DesktopWindowPosition) => void;
  onResize: (id: string, size: DesktopWindowSize) => void;
  onRestore: (item: DesktopItemData) => void;
  onDeletePermanently: (item: DesktopItemData) => void;
  onEmptyTrash: () => void;
  onSelectItem: (id: string, addToSelection: boolean) => void;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: (id: string) => void;
}

export function TrashWindow({
  id,
  title,
  items,
  position,
  size,
  zIndex,
  isFocused,
  boundsRef,
  selectedIds,
  renamingIds,
  onClose,
  onFocus,
  onMove,
  onResize,
  onRestore,
  onDeletePermanently,
  onEmptyTrash,
  onSelectItem,
  onRenameCommit,
  onRenameCancel,
}: TrashWindowProps) {
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set());

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

  const selectedItem = useMemo(() => {
    const selectedId = localSelection.values().next().value as string | undefined;
    return selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  }, [items, localSelection]);

  return (
    <DesktopWindow
      id={id}
      title={title}
      position={position}
      size={size}
      zIndex={zIndex}
      isFocused={isFocused}
      boundsRef={boundsRef}
      headerActions={
        <button
          type="button"
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
          onClick={onEmptyTrash}
        >
          Empty Trash
        </button>
      }
      onClose={onClose}
      onFocus={onFocus}
      onMove={onMove}
      onResize={onResize}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
          <span className="text-xs text-zinc-500">
            {items.length === 0 ? "Trash is empty" : `${items.length} items`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => selectedItem && onRestore(selectedItem)}
              disabled={!selectedItem}
            >
              Restore
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => selectedItem && onDeletePermanently(selectedItem)}
              disabled={!selectedItem}
            >
              Delete Permanently
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-zinc-50/70">
          <DesktopSurface
            items={items}
            layout="list"
            enableDnD={false}
            selectedIds={localSelection.size ? localSelection : selectedIds}
            renamingIds={renamingIds}
            onSelect={handleSelect}
            onContextMenu={() => undefined}
            onOpenItem={() => undefined}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
          />
        </div>
      </div>
    </DesktopWindow>
  );
}
