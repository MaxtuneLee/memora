import type { RecordingMeta } from "@/lib/files";

export type DesktopItemType = "file" | "folder" | "widget";

export interface Position {
  x: number;
  y: number;
}

export interface DesktopItemBase {
  id: string;
  name: string;
  type: DesktopItemType;
  position: Position;
}

export interface DesktopFileItem extends DesktopItemBase {
  type: "file";
  fileMeta: RecordingMeta;
}

export interface DesktopFolderItem extends DesktopItemBase {
  type: "folder";
  parentId: string | null;
  hasStoredPosition: boolean;
}

export interface DesktopWidgetItem extends DesktopItemBase {
  type: "widget";
  widgetType: "storage" | "clock" | "notes" | "trash";
  size: { width: number; height: number };
}

export type DesktopItem = DesktopFileItem | DesktopFolderItem | DesktopWidgetItem;

export interface DesktopState {
  items: Map<string, DesktopItem>;
  selectedIds: Set<string>;
  contextMenu: {
    isOpen: boolean;
    position: Position;
    targetId: string | null; // null = desktop background
  };
}

export const GRID_SIZE = 110;
export const ICON_SIZE = 64;
export const ITEM_GAP = 16;
export const DESKTOP_PADDING = 16;
