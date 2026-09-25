import type { RecordingMeta } from "@/types/library";

export type DesktopItemType = "file" | "folder" | "widget";

// Mirrors the folder table's reservedKind: "widgets" is the reserved root, "widgetDefinition"
// is a Widget Definition's folder. Both are protected from delete/rename/move in the Desktop UI.
export type DesktopFolderReservedKind = "widgets" | "widgetDefinition" | null;

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
  indexState: DesktopFileIndexState;
}

export type DesktopFileIndexStatus = "pending" | "processing" | "indexed" | "failed";

export interface DesktopFileIndexState {
  status: DesktopFileIndexStatus;
  indexedAt: number | null;
  summary: string | null;
}

export interface DesktopFolderItem extends DesktopItemBase {
  type: "folder";
  parentId: string | null;
  hasStoredPosition: boolean;
  reservedKind: DesktopFolderReservedKind;
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
