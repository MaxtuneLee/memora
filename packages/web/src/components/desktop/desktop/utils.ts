import { DESKTOP_PADDING, GRID_SIZE } from "@/types/desktop";
import type {
  DesktopFileItem,
  DesktopFolderItem,
  DesktopItem as DesktopItemType,
} from "@/types/desktop";
import type { RecordingMeta } from "@/types/library";
import { buildFolderBreadcrumbs } from "@/lib/tree/folderTree";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { file as LiveStoreFile } from "@/livestore/file";

import { WINDOW_Z_BASE } from "./types";

export const mapFileRowsToDesktopItems = (
  fileRows: readonly LiveStoreFile[],
  mapToMeta: (file: LiveStoreFile) => RecordingMeta,
): DesktopFileItem[] => {
  return fileRows.map((file) => {
    const meta = mapToMeta(file);
    return {
      id: file.id,
      name: file.name,
      type: "file" as const,
      position: {
        x: meta.positionX ?? 0,
        y: meta.positionY ?? 0,
      },
      fileMeta: meta,
    } satisfies DesktopFileItem;
  });
};

export const mapFolderRowsToDesktopItems = (
  folderRows: readonly LiveStoreFolder[],
): DesktopFolderItem[] => {
  return folderRows.map((folder) => {
    return {
      id: folder.id,
      name: folder.name,
      type: "folder",
      parentId: folder.parentId ?? null,
      position: { x: 0, y: 0 },
      hasStoredPosition: false,
    } satisfies DesktopFolderItem;
  });
};

export const getWindowIds = (
  previewIds: Array<{ id: string }>,
  folderIds: Array<{ id: string }>,
): string[] => {
  return [...previewIds.map((window) => window.id), ...folderIds.map((window) => window.id)];
};

export const buildWindowOrder = (
  order: string[],
  ids: string[],
  activeId?: string,
): string[] => {
  const idSet = new Set(ids);
  const normalized = order.filter((id) => idSet.has(id));
  ids.forEach((id) => {
    if (!normalized.includes(id)) {
      normalized.push(id);
    }
  });
  if (!activeId || !idSet.has(activeId)) {
    return normalized;
  }

  return [...normalized.filter((id) => id !== activeId), activeId];
};

export const buildZIndexMap = (windowOrder: string[]): Map<string, number> => {
  const map = new Map<string, number>();
  windowOrder.forEach((id, index) => {
    map.set(id, WINDOW_Z_BASE + index);
  });
  return map;
};

export const sortDesktopItems = (list: DesktopItemType[]): DesktopItemType[] => {
  return list.slice().sort((left, right) => {
    const leftIsTrash = left.type === "widget" && left.widgetType === "trash";
    const rightIsTrash = right.type === "widget" && right.widgetType === "trash";
    if (leftIsTrash && !rightIsTrash) return -1;
    if (rightIsTrash && !leftIsTrash) return 1;
    if (left.type === "folder" && right.type !== "folder") return -1;
    if (right.type === "folder" && left.type !== "folder") return 1;
    return left.name.localeCompare(right.name);
  });
};

export const getColumnsForWidth = (width: number): number => {
  const available = Math.max(0, width - DESKTOP_PADDING * 2);
  return Math.max(1, Math.floor(available / GRID_SIZE));
};

export const layoutDesktopItems = (
  list: DesktopItemType[],
  columns: number,
): DesktopItemType[] => {
  return list.map((item, index) => ({
    ...item,
    position: {
      x: DESKTOP_PADDING + (index % columns) * GRID_SIZE,
      y: DESKTOP_PADDING + Math.floor(index / columns) * GRID_SIZE,
    },
  }));
};

export const getDesktopBreadcrumbs = (
  folders: readonly LiveStoreFolder[],
  folderId: string | null,
): Array<{ id: string | null; name: string }> => {
  return buildFolderBreadcrumbs(folders, folderId, "Desktop");
};
