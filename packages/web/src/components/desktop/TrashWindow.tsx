import { useCallback, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import type { DesktopItem as DesktopItemData } from "@/types/desktop";
import type { DesktopWindowPosition, DesktopWindowSize } from "./DesktopWindow";
import { DesktopWindow } from "./DesktopWindow";
import { DesktopSurface } from "./DesktopSurface";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  actionButton: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    fontSize: "0.75rem",
    paddingBlock: 4,
    paddingInline: 10,
    transition: "background-color 150ms",
    ":disabled": { opacity: 0.5 },
    ":hover": { backgroundColor: tokens.hoverStrong },
  },
  headerAction: { fontWeight: 500 },
  body: { display: "flex", flexDirection: "column", height: "100%" },
  toolbar: {
    alignItems: "center",
    borderBottom: `1px solid ${tokens.border}`,
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 8,
    paddingInline: 12,
  },
  status: { color: tokens.textMuted, fontSize: "0.75rem" },
  actions: { alignItems: "center", display: "flex", gap: 8 },
  content: { backgroundColor: tokens.surfaceSoft, flex: 1, overflow: "auto" },
});

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
    return selectedId ? (items.find((item) => item.id === selectedId) ?? null) : null;
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
          {...stylex.props(styles.actionButton, styles.headerAction)}
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
      <div {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.toolbar)}>
          <span {...stylex.props(styles.status)}>
            {items.length === 0 ? "Trash is empty" : `${items.length} items`}
          </span>
          <div {...stylex.props(styles.actions)}>
            <button
              type="button"
              {...stylex.props(styles.actionButton)}
              onClick={() => selectedItem && onRestore(selectedItem)}
              disabled={!selectedItem}
            >
              Restore
            </button>
            <button
              type="button"
              {...stylex.props(styles.actionButton)}
              onClick={() => selectedItem && onDeletePermanently(selectedItem)}
              disabled={!selectedItem}
            >
              Delete Permanently
            </button>
          </div>
        </div>
        <div {...stylex.props(styles.content)}>
          <DesktopSurface
            items={items}
            layout="list"
            enableDnD={false}
            showFileIndexStatus={false}
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
