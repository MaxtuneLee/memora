import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useState } from "react";

import { fileEvents } from "@/livestore/file";
import { folderEvents } from "@/livestore/folder";
import type { DesktopItem as DesktopItemType } from "@/types/desktop";
import { FOLDER_WINDOW_DROP_PREFIX } from "@/components/desktop/DesktopFolderWindow";

import { DESKTOP_ROOT_ID } from "./types";

export const useDesktopDnD = ({
  items,
  store,
}: {
  items: Map<string, DesktopItemType>;
  store: { commit: (...events: unknown[]) => void };
}) => {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const movedItem = items.get(active.id as string);
      if (!movedItem || movedItem.type === "widget") {
        return;
      }

      if (over.id === DESKTOP_ROOT_ID) {
        if (movedItem.type === "file" && movedItem.fileMeta.parentId !== null) {
          store.commit(
            fileEvents.fileUpdated({
              id: movedItem.id,
              parentId: null,
              updatedAt: new Date(),
            }),
          );
        }
        if (movedItem.type === "folder" && movedItem.parentId !== null) {
          store.commit(
            folderEvents.folderUpdated({
              id: movedItem.id,
              parentId: null,
              updatedAt: new Date(),
            }),
          );
        }
        return;
      }

      const overId = over.id as string;
      if (overId.startsWith(FOLDER_WINDOW_DROP_PREFIX)) {
        const targetFolderId = overId.slice(FOLDER_WINDOW_DROP_PREFIX.length);
        if (movedItem.type === "file") {
          store.commit(
            fileEvents.fileUpdated({
              id: movedItem.id,
              parentId: targetFolderId,
              updatedAt: new Date(),
            }),
          );
        }
        if (movedItem.type === "folder" && movedItem.id !== targetFolderId) {
          store.commit(
            folderEvents.folderUpdated({
              id: movedItem.id,
              parentId: targetFolderId,
              updatedAt: new Date(),
            }),
          );
        }
        return;
      }

      const targetItem = items.get(over.id as string);
      if (!targetItem || targetItem.type !== "folder") {
        return;
      }
      if (movedItem.type === "folder" && movedItem.id === targetItem.id) {
        return;
      }

      if (movedItem.type === "file") {
        store.commit(
          fileEvents.fileUpdated({
            id: movedItem.id,
            parentId: targetItem.id,
            updatedAt: new Date(),
          }),
        );
      }
      if (movedItem.type === "folder") {
        store.commit(
          folderEvents.folderUpdated({
            id: movedItem.id,
            parentId: targetItem.id,
            updatedAt: new Date(),
          }),
        );
      }
    },
    [items, store],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  return {
    activeDragId,
    sensors,
    handleDragStart,
    handleDragEnd,
  };
};
