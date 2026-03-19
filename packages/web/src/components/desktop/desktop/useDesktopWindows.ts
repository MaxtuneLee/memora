import { useCallback, useMemo, useState } from "react";

import {
  buildWindowOrder,
  buildZIndexMap,
  getWindowIds,
} from "./utils";
import {
  DEFAULT_WINDOW_SIZE,
  ROOT_WINDOW_ID,
  TRASH_WINDOW_ID,
  WINDOW_OFFSET,
  type FolderWindowState,
  type PreviewWindowState,
} from "./types";

export const useDesktopWindows = () => {
  const [previewWindows, setPreviewWindows] = useState<PreviewWindowState[]>([]);
  const [folderWindows, setFolderWindows] = useState<FolderWindowState[]>([]);
  const [windowOrder, setWindowOrder] = useState<string[]>([]);

  const openPreviewWindow = useCallback((fileId: string) => {
    setPreviewWindows((previous) => {
      const existing = previous.find((window) => window.fileId === fileId);
      if (existing) {
        setWindowOrder((order) => {
          return buildWindowOrder(
            order,
            getWindowIds(previous, folderWindows),
            existing.id,
          );
        });
        return previous;
      }

      const offsetCount = (previous.length + folderWindows.length) % 6;
      const nextId = `preview:${fileId}`;
      const nextWindows = [
        ...previous,
        {
          id: nextId,
          fileId,
          position: {
            x: 80 + offsetCount * WINDOW_OFFSET,
            y: 80 + offsetCount * WINDOW_OFFSET,
          },
          size: DEFAULT_WINDOW_SIZE,
        },
      ];
      setWindowOrder((order) => {
        return buildWindowOrder(
          order,
          getWindowIds(nextWindows, folderWindows),
          nextId,
        );
      });
      return nextWindows;
    });
  }, [folderWindows]);

  const openFolderWindow = useCallback((folderId: string | null) => {
    setFolderWindows((previous) => {
      const existing = previous.find((window) => window.folderId === folderId);
      if (existing) {
        setWindowOrder((order) => {
          return buildWindowOrder(
            order,
            getWindowIds(previewWindows, previous),
            existing.id,
          );
        });
        return previous;
      }

      const offsetCount = (previous.length + previewWindows.length) % 6;
      const nextId = folderId ? `folder:${folderId}` : ROOT_WINDOW_ID;
      const nextWindows = [
        ...previous,
        {
          id: nextId,
          folderId,
          position: {
            x: 100 + offsetCount * WINDOW_OFFSET,
            y: 100 + offsetCount * WINDOW_OFFSET,
          },
          size: DEFAULT_WINDOW_SIZE,
          viewMode: "grid" as const,
        },
      ];
      setWindowOrder((order) => {
        return buildWindowOrder(
          order,
          getWindowIds(previewWindows, nextWindows),
          nextId,
        );
      });
      return nextWindows;
    });
  }, [previewWindows]);

  const openTrashWindow = useCallback(() => {
    setFolderWindows((previous) => {
      const existing = previous.find((window) => window.id === TRASH_WINDOW_ID);
      if (existing) {
        setWindowOrder((order) => {
          return buildWindowOrder(
            order,
            getWindowIds(previewWindows, previous),
            existing.id,
          );
        });
        return previous;
      }

      const offsetCount = (previous.length + previewWindows.length) % 6;
      const nextWindows = [
        ...previous,
        {
          id: TRASH_WINDOW_ID,
          folderId: null,
          position: {
            x: 120 + offsetCount * WINDOW_OFFSET,
            y: 120 + offsetCount * WINDOW_OFFSET,
          },
          size: DEFAULT_WINDOW_SIZE,
          viewMode: "list" as const,
        },
      ];
      setWindowOrder((order) => {
        return buildWindowOrder(
          order,
          getWindowIds(previewWindows, nextWindows),
          TRASH_WINDOW_ID,
        );
      });
      return nextWindows;
    });
  }, [previewWindows]);

  const closePreviewWindow = useCallback((id: string) => {
    setPreviewWindows((previous) => {
      const next = previous.filter((window) => window.id !== id);
      setWindowOrder((order) => buildWindowOrder(order, getWindowIds(next, folderWindows)));
      return next;
    });
  }, [folderWindows]);

  const closeFolderWindow = useCallback((id: string) => {
    setFolderWindows((previous) => {
      const next = previous.filter((window) => window.id !== id);
      setWindowOrder((order) => buildWindowOrder(order, getWindowIds(previewWindows, next)));
      return next;
    });
  }, [previewWindows]);

  const focusPreviewWindow = useCallback((id: string) => {
    setWindowOrder((order) => {
      return buildWindowOrder(order, getWindowIds(previewWindows, folderWindows), id);
    });
  }, [folderWindows, previewWindows]);

  const focusFolderWindow = useCallback((id: string) => {
    setWindowOrder((order) => {
      return buildWindowOrder(order, getWindowIds(previewWindows, folderWindows), id);
    });
  }, [folderWindows, previewWindows]);

  const movePreviewWindow = useCallback((id: string, position: { x: number; y: number }) => {
    setPreviewWindows((previous) => {
      return previous.map((window) => {
        return window.id === id ? { ...window, position } : window;
      });
    });
  }, []);

  const resizePreviewWindow = useCallback((id: string, size: { width: number; height: number }) => {
    setPreviewWindows((previous) => {
      return previous.map((window) => {
        return window.id === id ? { ...window, size } : window;
      });
    });
  }, []);

  const moveFolderWindow = useCallback((id: string, position: { x: number; y: number }) => {
    setFolderWindows((previous) => {
      return previous.map((window) => {
        return window.id === id ? { ...window, position } : window;
      });
    });
  }, []);

  const resizeFolderWindow = useCallback((id: string, size: { width: number; height: number }) => {
    setFolderWindows((previous) => {
      return previous.map((window) => {
        return window.id === id ? { ...window, size } : window;
      });
    });
  }, []);

  const toggleFolderView = useCallback((id: string, mode: "grid" | "list") => {
    setFolderWindows((previous) => {
      return previous.map((window) => {
        return window.id === id ? { ...window, viewMode: mode } : window;
      });
    });
  }, []);

  const navigateFolderWindow = useCallback((windowId: string, folderId: string | null) => {
    setFolderWindows((previous) => {
      return previous.map((window) => {
        return window.id === windowId ? { ...window, folderId } : window;
      });
    });
  }, []);

  const replaceFolderWindowFolder = useCallback((
    currentFolderId: string | null,
    nextFolderId: string | null,
  ) => {
    setFolderWindows((previous) => {
      return previous.map((window) => {
        return window.folderId === currentFolderId
          ? { ...window, folderId: nextFolderId }
          : window;
      });
    });
  }, []);

  const zIndexMap = useMemo(() => {
    return buildZIndexMap(windowOrder);
  }, [windowOrder]);
  const focusedWindowId = windowOrder.length
    ? windowOrder[windowOrder.length - 1]
    : null;

  return {
    previewWindows,
    folderWindows,
    zIndexMap,
    focusedWindowId,
    openPreviewWindow,
    openFolderWindow,
    openTrashWindow,
    closePreviewWindow,
    focusPreviewWindow,
    movePreviewWindow,
    resizePreviewWindow,
    closeFolderWindow,
    focusFolderWindow,
    moveFolderWindow,
    resizeFolderWindow,
    toggleFolderView,
    navigateFolderWindow,
    replaceFolderWindowFolder,
  };
};
