export interface PreviewWindowState {
  id: string;
  fileId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface FolderWindowState {
  id: string;
  folderId: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  viewMode: "grid" | "list";
}

export const DESKTOP_ROOT_ID = "desktop-root";
export const DEFAULT_WINDOW_SIZE = { width: 520, height: 420 };
export const WINDOW_OFFSET = 24;
export const WINDOW_Z_BASE = 10;
export const ROOT_WINDOW_ID = "root";
export const TRASH_WINDOW_ID = "trash";
export const TRASH_ITEM_ID = "trash";
