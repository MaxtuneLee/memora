import { useCallback, useState } from "react";
import type { DesktopItem, Position } from "@/types/desktop";
import { GRID_SIZE } from "@/types/desktop";

interface UseDesktopStateOptions {
  initialItems?: DesktopItem[];
}

interface ContextMenuState {
  isOpen: boolean;
  position: Position;
  targetId: string | null;
  parentId: string | null;
  origin: { left: number; top: number } | null;
}

export function useDesktopState(options: UseDesktopStateOptions = {}) {
  const [items, setItems] = useState<Map<string, DesktopItem>>(() => {
    const map = new Map<string, DesktopItem>();
    options.initialItems?.forEach((item) => map.set(item.id, item));
    return map;
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    targetId: null,
    parentId: null,
    origin: null,
  });

  const snapToGrid = useCallback((position: Position): Position => {
    return {
      x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(position.y / GRID_SIZE) * GRID_SIZE,
    };
  }, []);

  const updateItemPosition = useCallback(
    (id: string, delta: Position) => {
      setItems((prev) => {
        const item = prev.get(id);
        if (!item) return prev;

        const newPosition = snapToGrid({
          x: item.position.x + delta.x,
          y: item.position.y + delta.y,
        });

        // Prevent negative positions
        const clampedPosition = {
          x: Math.max(0, newPosition.x),
          y: Math.max(0, newPosition.y),
        };

        const newMap = new Map(prev);
        newMap.set(id, { ...item, position: clampedPosition });
        return newMap;
      });
    },
    [snapToGrid],
  );

  const selectItem = useCallback(
    (id: string, addToSelection = false) => {
      setSelectedIds((prev) => {
        if (addToSelection) {
          const newSet = new Set(prev);
          if (newSet.has(id)) {
            newSet.delete(id);
          } else {
            newSet.add(id);
          }
          return newSet;
        }
        return new Set([id]);
      });
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const openContextMenu = useCallback(
    (
      position: Position,
      targetId: string | null = null,
      parentId: string | null = null,
      origin: { left: number; top: number } | null = null,
    ) => {
      setContextMenu({
        isOpen: true,
        position,
        targetId,
        parentId,
        origin,
      });
      if (targetId && !selectedIds.has(targetId)) {
        setSelectedIds(new Set([targetId]));
      }
    },
    [selectedIds],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const addItem = useCallback((item: DesktopItem) => {
    setItems((prev) => {
      const newMap = new Map(prev);
      newMap.set(item.id, item);
      return newMap;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  }, []);

  const renameItem = useCallback((id: string, newName: string) => {
    setItems((prev) => {
      const item = prev.get(id);
      if (!item) return prev;
      const newMap = new Map(prev);
      newMap.set(id, { ...item, name: newName });
      return newMap;
    });
  }, []);

  return {
    items,
    selectedIds,
    contextMenu,
    updateItemPosition,
    selectItem,
    clearSelection,
    openContextMenu,
    closeContextMenu,
    addItem,
    removeItem,
    renameItem,
    setItems,
  };
}

export type DesktopStateReturn = ReturnType<typeof useDesktopState>;
