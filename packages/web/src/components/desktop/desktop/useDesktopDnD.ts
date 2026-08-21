import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useState } from "react";

import {
  moveFolderWithPathPolicy,
  movePathAddressableFileWithPathPolicy,
} from "@/lib/editor/pathMutations";
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

      const fileRows = Array.from(items.values())
        .filter((item): item is Extract<DesktopItemType, { type: "file" }> => item.type === "file")
        .map((item) => item.fileMeta);
      const folderRows = Array.from(items.values()).filter(
        (item): item is Extract<DesktopItemType, { type: "folder" }> => item.type === "folder",
      );

      if (over.id === DESKTOP_ROOT_ID) {
        if (movedItem.type === "file" && movedItem.fileMeta.parentId !== null) {
          try {
            movePathAddressableFileWithPathPolicy(fileRows, {
              id: movedItem.id,
              name: movedItem.fileMeta.name,
              parentId: null,
              type: movedItem.fileMeta.type,
            });
          } catch (error) {
            console.warn("Rejected file move:", error);
            return;
          }

          store.commit(
            fileEvents.fileUpdated({
              id: movedItem.id,
              parentId: null,
              updatedAt: new Date(),
            }),
          );
        }
        if (movedItem.type === "folder" && movedItem.parentId !== null) {
          try {
            moveFolderWithPathPolicy(folderRows, {
              id: movedItem.id,
              name: movedItem.name,
              parentId: null,
            });
          } catch (error) {
            console.warn("Rejected folder move:", error);
            return;
          }

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
          try {
            movePathAddressableFileWithPathPolicy(fileRows, {
              id: movedItem.id,
              name: movedItem.fileMeta.name,
              parentId: targetFolderId,
              type: movedItem.fileMeta.type,
            });
          } catch (error) {
            console.warn("Rejected file move:", error);
            return;
          }

          store.commit(
            fileEvents.fileUpdated({
              id: movedItem.id,
              parentId: targetFolderId,
              updatedAt: new Date(),
            }),
          );
        }
        if (movedItem.type === "folder" && movedItem.id !== targetFolderId) {
          try {
            moveFolderWithPathPolicy(folderRows, {
              id: movedItem.id,
              name: movedItem.name,
              parentId: targetFolderId,
            });
          } catch (error) {
            console.warn("Rejected folder move:", error);
            return;
          }

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
        try {
          movePathAddressableFileWithPathPolicy(fileRows, {
            id: movedItem.id,
            name: movedItem.fileMeta.name,
            parentId: targetItem.id,
            type: movedItem.fileMeta.type,
          });
        } catch (error) {
          console.warn("Rejected file move:", error);
          return;
        }

        store.commit(
          fileEvents.fileUpdated({
            id: movedItem.id,
            parentId: targetItem.id,
            updatedAt: new Date(),
          }),
        );
      }
      if (movedItem.type === "folder") {
        try {
          moveFolderWithPathPolicy(folderRows, {
            id: movedItem.id,
            name: movedItem.name,
            parentId: targetItem.id,
          });
        } catch (error) {
          console.warn("Rejected folder move:", error);
          return;
        }

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
