import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { Tooltip } from "@base-ui/react/tooltip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@livestore/react";
import { queryDb } from "@livestore/livestore";
import { fileEvents, fileTable, type file as LiveStoreFile } from "@/livestore/file";
import { FILES_DIR, FILE_META_SUFFIX, type RecordingMeta } from "@/lib/files";
import { DesktopSurface } from "./DesktopSurface";
import { DesktopContextMenu } from "./DesktopContextMenu";
import { DesktopFolderWindow } from "./DesktopFolderWindow";
import { DesktopPreviewWindow } from "./DesktopPreviewWindow";
import { useDesktopState } from "./useDesktopState";
import type {
  DesktopFileItem,
  DesktopFolderItem,
  DesktopItem as DesktopItemType,
  DesktopWidgetItem,
} from "./desktopTypes";
import { DESKTOP_PADDING, GRID_SIZE } from "./desktopTypes";
import { StorageWidget } from "./StorageWidget";
import { folderEvents, folderTable, type folder as LiveStoreFolder } from "@/livestore/folder";
import { ConfirmDialog } from "./ConfirmDialog";
import { TrashWindow } from "./TrashWindow";
import { useTrashActions } from "./useTrashActions";

const filesQuery$ = queryDb(
  (_store) => {
    return fileTable
      .where({ deletedAt: null, purgedAt: null })
      .orderBy("updatedAt", "desc");
  },
  {
    label: "desktop:files",
  },
);

const foldersQuery$ = queryDb(
  (_store) => {
    return folderTable
      .where({ deletedAt: null, purgedAt: null })
      .orderBy("updatedAt", "desc");
  },
  {
    label: "desktop:folders",
  },
);

const allFilesQuery$ = queryDb(
  (_store) => {
    return fileTable.orderBy("updatedAt", "desc");
  },
  {
    label: "desktop:files-all",
  },
);

const allFoldersQuery$ = queryDb(
  (_store) => {
    return folderTable.orderBy("updatedAt", "desc");
  },
  {
    label: "desktop:folders-all",
  },
);

interface DesktopProps {
  onUploadFile: (parentId: string | null) => void;
  onDeleteFile: (file: RecordingMeta) => Promise<void>;
}

interface PreviewWindowState {
  id: string;
  fileId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface FolderWindowState {
  id: string;
  folderId: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  viewMode: "grid" | "list";
}

const DEFAULT_WINDOW_SIZE = { width: 520, height: 420 };
const WINDOW_OFFSET = 24;
const WINDOW_Z_BASE = 10;
const ROOT_WINDOW_ID = "root";
const TRASH_WINDOW_ID = "trash";
const TRASH_ITEM_ID = "trash";

export function Desktop({ onUploadFile, onDeleteFile }: DesktopProps) {
  const { store } = useStore();
  const fileRows = store.useQuery(filesQuery$);
  const folderRows = store.useQuery(foldersQuery$);
  const allFileRows = store.useQuery(allFilesQuery$);
  const allFolderRows = store.useQuery(allFoldersQuery$);
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewWindows, setPreviewWindows] = useState<PreviewWindowState[]>([]);
  const [folderWindows, setFolderWindows] = useState<FolderWindowState[]>([]);
  const [renamingIds, setRenamingIds] = useState<Set<string>>(new Set());
  const [desktopSize, setDesktopSize] = useState({ width: 0, height: 0 });
  const [windowOrder, setWindowOrder] = useState<string[]>([]);

  const mapToMeta = useCallback((file: LiveStoreFile): RecordingMeta => {
    const createdAt =
      file.createdAt instanceof Date ? file.createdAt.getTime() : Date.now();
    const updatedAt =
      file.updatedAt instanceof Date ? file.updatedAt.getTime() : createdAt;
    return {
      id: file.id,
      name: file.name,
      type: file.type,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      storageType: file.storageType,
      storagePath: file.storagePath,
      metaPath: `${FILES_DIR}/${file.id}/${file.id}${FILE_META_SUFFIX}`,
      parentId: file.parentId ?? null,
      positionX: file.positionX ?? null,
      positionY: file.positionY ?? null,
      createdAt,
      updatedAt,
      durationSec: file.durationSec ?? null,
      transcriptPath: file.transcriptPath ?? null,
      transcriptPreview: file.indexSummary ?? null,
    };
  }, []);

  const mapToFolder = useCallback((folder: LiveStoreFolder): DesktopFolderItem => {
    return {
      id: folder.id,
      name: folder.name,
      type: "folder",
      parentId: folder.parentId ?? null,
      position: {
        x: 0,
        y: 0,
      },
      hasStoredPosition: false,
    } satisfies DesktopFolderItem;
  }, []);

  // Convert files to desktop items with grid positions
  const fileItems = useMemo((): DesktopFileItem[] => {
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
  }, [fileRows, mapToMeta]);

  const folderItems = useMemo((): DesktopFolderItem[] => {
    return folderRows.map((folder) => mapToFolder(folder));
  }, [folderRows, mapToFolder]);

  const trashedFileItems = useMemo((): DesktopFileItem[] => {
    return allFileRows
      .filter((file) => file.deletedAt && !file.purgedAt)
      .map((file) => {
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
  }, [allFileRows, mapToMeta]);

  const trashedFolderItems = useMemo((): DesktopFolderItem[] => {
    return allFolderRows
      .filter((folder) => folder.deletedAt && !folder.purgedAt)
      .map((folder) => mapToFolder(folder));
  }, [allFolderRows, mapToFolder]);

  const trashItem = useMemo((): DesktopWidgetItem => {
    return {
      id: TRASH_ITEM_ID,
      name: "Trash",
      type: "widget",
      widgetType: "trash",
      position: { x: DESKTOP_PADDING, y: DESKTOP_PADDING },
      size: { width: GRID_SIZE, height: GRID_SIZE },
    } satisfies DesktopWidgetItem;
  }, []);

  const folderMap = useMemo(() => {
    const map = new Map<string, LiveStoreFolder>();
    folderRows.forEach((folder) => map.set(folder.id, folder));
    return map;
  }, [folderRows]);

  const {
    items,
    selectedIds,
    contextMenu,
    selectItem,
    clearSelection,
    openContextMenu,
    closeContextMenu,
    setItems,
    removeItem,
  } = useDesktopState({ initialItems: [] });

  // Sync file items from database into desktop state
  useEffect(() => {
    setItems((prev) => {
      const newMap = new Map(prev);

      const mergeItem = (item: DesktopItemType) => {
        const existing = newMap.get(item.id);
        const position = existing?.position ?? { x: 0, y: 0 };
        const merged = {
          ...item,
          position,
          ...(item.type === "folder" ? { hasStoredPosition: false } : {}),
        } satisfies DesktopItemType;
        newMap.set(item.id, merged);
      };

      fileItems.forEach(mergeItem);
      folderItems.forEach(mergeItem);
      mergeItem(trashItem);

      const fileIds = new Set(fileItems.map((f) => f.id));
      const folderIds = new Set(folderItems.map((f) => f.id));
      newMap.forEach((_, id) => {
        const existingItem = prev.get(id);
        if (existingItem?.type === "file" && !fileIds.has(id)) {
          newMap.delete(id);
        }
        if (existingItem?.type === "folder" && !folderIds.has(id)) {
          newMap.delete(id);
        }
        if (existingItem?.type === "widget" && existingItem.widgetType === "trash") {
          return;
        }
      });
      return newMap;
    });
  }, [fileItems, folderItems, setItems, trashItem]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const updateSize = () => {
      setDesktopSize({ width: node.clientWidth, height: node.clientHeight });
    };
    updateSize();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDesktopSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const getWindowIds = useCallback(
    (previews: PreviewWindowState[], folders: FolderWindowState[]) => {
      return [...previews.map((window) => window.id), ...folders.map((window) => window.id)];
    },
    [],
  );

  const buildWindowOrder = useCallback(
    (order: string[], ids: string[], activeId?: string) => {
      const idSet = new Set(ids);
      const normalized = order.filter((id) => idSet.has(id));
      ids.forEach((id) => {
        if (!normalized.includes(id)) {
          normalized.push(id);
        }
      });
      if (!activeId || !idSet.has(activeId)) return normalized;
      const withoutActive = normalized.filter((id) => id !== activeId);
      withoutActive.push(activeId);
      return withoutActive;
    },
    [],
  );

  useEffect(() => {
    setWindowOrder((prev) =>
      buildWindowOrder(prev, getWindowIds(previewWindows, folderWindows)),
    );
  }, [buildWindowOrder, folderWindows, getWindowIds, previewWindows]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      if (active.id === over.id) return;
      const movedItem = items.get(active.id as string);
      const targetItem = items.get(over.id as string);
      if (!movedItem || !targetItem) return;
      if (targetItem.type !== "folder") return;
      if (movedItem.type === "widget") return;
      if (movedItem.type === "folder" && movedItem.id === targetItem.id) return;

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

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDesktopClick = useCallback(() => {
    clearSelection();
    if (contextMenu.isOpen) {
      closeContextMenu();
    }
  }, [clearSelection, contextMenu.isOpen, closeContextMenu]);

  const handleDesktopContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      openContextMenu(
        { x: e.clientX, y: e.clientY },
        null,
        null,
        { left: rect.left, top: rect.top },
      );
    },
    [openContextMenu],
  );

  const handleItemContextMenu = useCallback(
    (
      e: React.MouseEvent,
      id: string | null,
      parentId: string | null = null,
      origin: { left: number; top: number } | null = null,
    ) => {
      openContextMenu({ x: e.clientX, y: e.clientY }, id, parentId, origin);
    },
    [openContextMenu],
  );

  const handleNewFolder = useCallback(
    (parentId: string | null = null) => {
      closeContextMenu();
      const id = crypto.randomUUID();
      store.commit(
        folderEvents.folderCreated({
          id,
          name: "New Folder",
          parentId,
          positionX: null,
          positionY: null,
          createdAt: new Date(),
        }),
      );
      setRenamingIds((prev) => new Set(prev).add(id));
    },
    [closeContextMenu, store],
  );

  const handleNewNote = useCallback(() => {
    closeContextMenu();
    // TODO: Navigate to new note
  }, [closeContextMenu]);

  const handleUpload = useCallback(() => {
    closeContextMenu();
    onUploadFile(contextMenu.parentId ?? null);
  }, [closeContextMenu, contextMenu.parentId, onUploadFile]);

  const handleRename = useCallback(() => {
    closeContextMenu();
    const targetId = contextMenu.targetId;
    if (!targetId) return;
    const item = items.get(targetId);
    if (item?.type === "widget") return;
    setRenamingIds((prev) => new Set(prev).add(targetId));
  }, [closeContextMenu, contextMenu.targetId, items]);


  const openPreviewWindow = useCallback(
    (fileId: string) => {
      setPreviewWindows((prev) => {
        const existing = prev.find((window) => window.fileId === fileId);
        if (existing) {
          setWindowOrder((order) =>
            buildWindowOrder(order, getWindowIds(prev, folderWindows), existing.id),
          );
          return prev;
        }

        const offsetCount = (prev.length + folderWindows.length) % 6;
        const position = {
          x: 80 + offsetCount * WINDOW_OFFSET,
          y: 80 + offsetCount * WINDOW_OFFSET,
        };

        const nextId = `preview:${fileId}`;
        const nextWindows = [
          ...prev,
          {
            id: nextId,
            fileId,
            position,
            size: DEFAULT_WINDOW_SIZE,
            zIndex: WINDOW_Z_BASE,
          },
        ];

        setWindowOrder((order) =>
          buildWindowOrder(order, getWindowIds(nextWindows, folderWindows), nextId),
        );

        return nextWindows;
      });
    },
    [buildWindowOrder, folderWindows, getWindowIds],
  );

  const openFolderWindow = useCallback(
    (folderId: string | null) => {
      setFolderWindows((prev) => {
        const existing = prev.find((window) => window.folderId === folderId);
        if (existing) {
          setWindowOrder((order) =>
            buildWindowOrder(order, getWindowIds(previewWindows, prev), existing.id),
          );
          return prev;
        }

        const offsetCount = (prev.length + previewWindows.length) % 6;
        const position = {
          x: 100 + offsetCount * WINDOW_OFFSET,
          y: 100 + offsetCount * WINDOW_OFFSET,
        };

        const nextId = folderId ? `folder:${folderId}` : ROOT_WINDOW_ID;
        const nextWindows: FolderWindowState[] = [
          ...prev,
          {
            id: nextId,
            folderId,
            position,
            size: DEFAULT_WINDOW_SIZE,
            zIndex: WINDOW_Z_BASE,
            viewMode: "grid" as const,
          },
        ];

        setWindowOrder((order) =>
          buildWindowOrder(order, getWindowIds(previewWindows, nextWindows), nextId),
        );

        return nextWindows;
      });
    },
    [buildWindowOrder, getWindowIds, previewWindows],
  );

  const openTrashWindow = useCallback(() => {
    setFolderWindows((prev) => {
      const existing = prev.find((window) => window.id === TRASH_WINDOW_ID);
      if (existing) {
        setWindowOrder((order) =>
          buildWindowOrder(order, getWindowIds(previewWindows, prev), existing.id),
        );
        return prev;
      }
      const offsetCount = (prev.length + previewWindows.length) % 6;
      const position = {
        x: 120 + offsetCount * WINDOW_OFFSET,
        y: 120 + offsetCount * WINDOW_OFFSET,
      };

      const nextWindows: FolderWindowState[] = [
        ...prev,
        {
          id: TRASH_WINDOW_ID,
          folderId: null,
          position,
          size: DEFAULT_WINDOW_SIZE,
          zIndex: WINDOW_Z_BASE,
          viewMode: "list" as const,
        },
      ];

      setWindowOrder((order) =>
        buildWindowOrder(order, getWindowIds(previewWindows, nextWindows), TRASH_WINDOW_ID),
      );

      return nextWindows;
    });
  }, [buildWindowOrder, getWindowIds, previewWindows]);

  const handleOpenInNewWindow = useCallback(() => {
    closeContextMenu();
    const targetId = contextMenu.targetId;
    if (!targetId) return;
    const item = items.get(targetId);
    if (item?.type === "folder") {
      openFolderWindow(item.id);
    }
  }, [closeContextMenu, contextMenu.targetId, items, openFolderWindow]);

  const closePreviewWindow = useCallback((id: string) => {
    setPreviewWindows((prev) => {
      const next = prev.filter((window) => window.id !== id);
      setWindowOrder((order) => buildWindowOrder(order, getWindowIds(next, folderWindows)));
      return next;
    });
  }, [buildWindowOrder, folderWindows, getWindowIds]);

  const focusPreviewWindow = useCallback(
    (id: string) => {
      setWindowOrder((order) =>
        buildWindowOrder(order, getWindowIds(previewWindows, folderWindows), id),
      );
    },
    [buildWindowOrder, folderWindows, getWindowIds, previewWindows],
  );

  const movePreviewWindow = useCallback(
    (id: string, position: { x: number; y: number }) => {
      setPreviewWindows((prev) =>
        prev.map((window) =>
          window.id === id ? { ...window, position } : window,
        ),
      );
    },
    [],
  );

  const resizePreviewWindow = useCallback(
    (id: string, size: { width: number; height: number }) => {
      setPreviewWindows((prev) =>
        prev.map((window) => (window.id === id ? { ...window, size } : window)),
      );
    },
    [],
  );

  const closeFolderWindow = useCallback((id: string) => {
    setFolderWindows((prev) => {
      const next = prev.filter((window) => window.id !== id);
      setWindowOrder((order) => buildWindowOrder(order, getWindowIds(previewWindows, next)));
      return next;
    });
  }, [buildWindowOrder, getWindowIds, previewWindows]);

  const focusFolderWindow = useCallback(
    (id: string) => {
      setWindowOrder((order) =>
        buildWindowOrder(order, getWindowIds(previewWindows, folderWindows), id),
      );
    },
    [buildWindowOrder, folderWindows, getWindowIds, previewWindows],
  );

  const moveFolderWindow = useCallback(
    (id: string, position: { x: number; y: number }) => {
      setFolderWindows((prev) =>
        prev.map((window) =>
          window.id === id ? { ...window, position } : window,
        ),
      );
    },
    [],
  );

  const resizeFolderWindow = useCallback(
    (id: string, size: { width: number; height: number }) => {
      setFolderWindows((prev) =>
        prev.map((window) => (window.id === id ? { ...window, size } : window)),
      );
    },
    [],
  );

  const toggleFolderView = useCallback(
    (id: string, mode: "grid" | "list") => {
      setFolderWindows((prev) =>
        prev.map((window) =>
          window.id === id ? { ...window, viewMode: mode } : window,
        ),
      );
    },
    [],
  );

  const zIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    windowOrder.forEach((id, index) => {
      map.set(id, WINDOW_Z_BASE + index);
    });
    return map;
  }, [windowOrder]);

  const focusedWindowId = windowOrder.length ? windowOrder[windowOrder.length - 1] : null;

  const itemsArray = useMemo(() => Array.from(items.values()), [items]);

  const rootItems = useMemo(() => {
    return itemsArray.filter((item) => {
      if (item.type === "file") return item.fileMeta.parentId === null;
      if (item.type === "folder") return item.parentId === null;
      if (item.type === "widget") return true;
      return false;
    });
  }, [itemsArray]);

  const buildBreadcrumbs = useCallback(
    (folderId: string | null) => {
      const crumbs: { id: string | null; name: string }[] = [
        { id: null, name: "Desktop" },
      ];
      if (!folderId) return crumbs;
      const chain: { id: string; name: string }[] = [];
      let currentId: string | null = folderId;
      const visited = new Set<string>();
      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const folder = folderMap.get(currentId);
        if (!folder) break;
        chain.unshift({ id: folder.id, name: folder.name || "Untitled" });
        currentId = folder.parentId ?? null;
      }
      return [...crumbs, ...chain];
    },
    [folderMap],
  );

  const handleOpenItem = useCallback(
    (item: DesktopItemType, activeFolderId?: string | null) => {
      if (item.type === "widget" && item.widgetType === "trash") {
        openTrashWindow();
        return;
      }
      if (item.type === "file") {
        openPreviewWindow(item.id);
        return;
      }
      if (item.type === "folder") {
        if (activeFolderId !== undefined) {
          setFolderWindows((prev) =>
            prev.map((window) =>
              window.folderId === activeFolderId
                ? { ...window, folderId: item.id }
                : window,
            ),
          );
          return;
        }
        openFolderWindow(item.id);
      }
    },
    [openFolderWindow, openPreviewWindow, openTrashWindow],
  );

  const navigateFolderWindow = useCallback((windowId: string, folderId: string | null) => {
    setFolderWindows((prev) =>
      prev.map((window) =>
        window.id === windowId
          ? {
              ...window,
              folderId,
            }
          : window,
      ),
    );
  }, []);

  const handleRenameCommit = useCallback(
    (id: string, name: string) => {
      setRenamingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const item = items.get(id);
      if (!item) return;
      if (item.type === "widget") return;
      if (item.type === "file") {
        store.commit(
          fileEvents.fileUpdated({
            id,
            name,
            updatedAt: new Date(),
          }),
        );
      } else if (item.type === "folder") {
        store.commit(
          folderEvents.folderUpdated({
            id,
            name,
            updatedAt: new Date(),
          }),
        );
      }
    },
    [items, store],
  );

  const handleRenameCancel = useCallback((id: string) => {
    setRenamingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const sortItems = useCallback((list: DesktopItemType[]) => {
    return list.slice().sort((a, b) => {
      const aIsTrash = a.type === "widget" && a.widgetType === "trash";
      const bIsTrash = b.type === "widget" && b.widgetType === "trash";
      if (aIsTrash && !bIsTrash) return -1;
      if (bIsTrash && !aIsTrash) return 1;
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (b.type === "folder" && a.type !== "folder") return 1;
      return a.name.localeCompare(b.name);
    });
  }, []);

  const getColumnsForWidth = useCallback((width: number) => {
    const available = Math.max(0, width - DESKTOP_PADDING * 2);
    return Math.max(1, Math.floor(available / GRID_SIZE));
  }, []);

  const layoutItems = useCallback(
    (list: DesktopItemType[], columns: number) => {
      return list.map((item, index) => ({
        ...item,
        position: {
          x: DESKTOP_PADDING + (index % columns) * GRID_SIZE,
          y: DESKTOP_PADDING + Math.floor(index / columns) * GRID_SIZE,
        },
      }));
    },
    [],
  );

  const sortedRootItems = useMemo(() => {
    return sortItems(rootItems);
  }, [rootItems, sortItems]);

  const sortedRootLayout = useMemo(() => {
    const columns = getColumnsForWidth(desktopSize.width);
    return layoutItems(sortedRootItems, columns);
  }, [desktopSize.width, getColumnsForWidth, layoutItems, sortedRootItems]);

  const {
    confirmAction,
    confirmDialogCopy,
    requestTrash,
    requestPermanentDelete,
    requestEmptyTrash,
    confirm,
    cancel,
    restoreItem,
  } = useTrashActions({
    store,
    allFileRows,
    allFolderRows,
    trashedFileItems,
    trashedFolderItems,
    mapToMeta,
    onDeleteFile,
    removeItem,
  });

  const handleDelete = useCallback(async () => {
    const targetId = contextMenu.targetId;
    closeContextMenu();
    if (!targetId) return;

    const item = items.get(targetId);
    if (item?.type === "widget") return;
    if (item) {
      requestTrash(item);
    }
  }, [closeContextMenu, contextMenu.targetId, items, requestTrash]);

  return (
    <Tooltip.Provider>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          ref={containerRef}
          className="relative h-full w-full overflow-auto bg-gradient-to-br from-zinc-50 via-zinc-100/50 to-zinc-100"
          onClick={handleDesktopClick}
          onContextMenu={handleDesktopContextMenu}
        >
        {/* Grid pattern background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px)
            `,
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          }}
        />

          <DesktopSurface
            items={sortedRootLayout}
            layout="desktop"
            enableDnD
            selectedIds={selectedIds}
            renamingIds={renamingIds}
            onSelect={selectItem}
            onContextMenu={handleItemContextMenu}
            onOpenItem={handleOpenItem}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={handleRenameCancel}
            contextMenuTargetId={null}
            contextMenuParentId={null}
          />

          {/* Storage widget */}
          <StorageWidget />

          {/* Context menu */}
          <DesktopContextMenu
            isOpen={contextMenu.isOpen}
            position={contextMenu.position}
            targetId={contextMenu.targetId}
            targetType={contextMenu.targetId ? items.get(contextMenu.targetId)?.type ?? null : null}
            onClose={closeContextMenu}
            onNewFolder={() => handleNewFolder(contextMenu.parentId ?? null)}
            onNewNote={handleNewNote}
            onUploadAudio={handleUpload}
            onRename={handleRename}
            onDelete={handleDelete}
            onOpenInNewWindow={
              contextMenu.targetId && items.get(contextMenu.targetId)?.type === "folder"
                ? handleOpenInNewWindow
                : undefined
            }
          />

          {previewWindows.map((window) => {
            const item = items.get(window.fileId);
            if (!item || (item.type !== "file" && item.type !== "folder")) {
              return null;
            }
            const zIndex = zIndexMap.get(window.id) ?? WINDOW_Z_BASE;
            const isFocused = window.id === focusedWindowId;
            return (
              <DesktopPreviewWindow
                key={window.id}
                id={window.id}
                item={item}
                position={window.position}
                size={window.size}
                zIndex={zIndex}
                isFocused={isFocused}
                boundsRef={containerRef}
                onClose={closePreviewWindow}
                onFocus={focusPreviewWindow}
                onMove={movePreviewWindow}
                onResize={resizePreviewWindow}
              />
            );
          })}

          {folderWindows.map((window) => {
            const isTrashWindow = window.id === TRASH_WINDOW_ID;
            const isRootWindow = window.folderId === null && !isTrashWindow;
            const folderItem = isRootWindow ? null : items.get(window.folderId ?? "");
            if (!isRootWindow && !isTrashWindow && (!folderItem || folderItem.type !== "folder")) {
              return null;
            }

            const zIndex = zIndexMap.get(window.id) ?? WINDOW_Z_BASE;
            const isFocused = window.id === focusedWindowId;

            const folderContents = isTrashWindow
              ? sortItems([...trashedFolderItems, ...trashedFileItems])
              : sortItems(
                  itemsArray.filter((item) => {
                    if (item.type === "file") return item.fileMeta.parentId === window.folderId;
                    if (item.type === "folder") return item.parentId === window.folderId;
                    return false;
                  }),
                );

            const arrangedFolderContents =
              window.viewMode === "grid"
                ? layoutItems(folderContents, getColumnsForWidth(window.size.width))
                : folderContents;

            const title = isTrashWindow
              ? "Trash"
              : isRootWindow
                ? "Desktop"
                : (folderItem?.type === "folder" ? folderItem.name : "Folder");

            return isTrashWindow ? (
              <TrashWindow
                key={window.id}
                id={window.id}
                title={title}
                items={arrangedFolderContents}
                position={window.position}
                size={window.size}
                zIndex={zIndex}
                isFocused={isFocused}
                boundsRef={containerRef}
                onClose={closeFolderWindow}
                onFocus={focusFolderWindow}
                onMove={moveFolderWindow}
                onResize={resizeFolderWindow}
                onRestore={(item) => restoreItem(item)}
                onDeletePermanently={requestPermanentDelete}
                onEmptyTrash={requestEmptyTrash}
                selectedIds={selectedIds}
                renamingIds={renamingIds}
                onSelectItem={selectItem}
                onRenameCommit={handleRenameCommit}
                onRenameCancel={handleRenameCancel}
              />
            ) : (
              <DesktopFolderWindow
                key={window.id}
                id={window.id}
                folderId={window.folderId}
                title={title}
                items={folderContents}
                breadcrumbItems={buildBreadcrumbs(window.folderId)}
                position={window.position}
                size={window.size}
                zIndex={zIndex}
                isFocused={isFocused}
                viewMode={window.viewMode}
                boundsRef={containerRef}
                renamingIds={renamingIds}
                onToggleView={toggleFolderView}
                onOpenBreadcrumb={(id) => navigateFolderWindow(window.id, id)}
                onClose={closeFolderWindow}
                onFocus={focusFolderWindow}
                onMove={moveFolderWindow}
                onResize={resizeFolderWindow}
                onOpenItem={handleOpenItem}
                onContextMenu={handleItemContextMenu}
                onSelectItem={selectItem}
                onRenameCommit={handleRenameCommit}
                onRenameCancel={handleRenameCancel}
              />
            );
          })}
          <ConfirmDialog
            isOpen={confirmAction !== null}
            title={confirmDialogCopy?.title ?? ""}
            description={confirmDialogCopy?.description ?? ""}
            confirmLabel={confirmDialogCopy?.confirmLabel ?? "Confirm"}
            tone={confirmDialogCopy?.tone ?? "default"}
            onConfirm={confirm}
            onCancel={cancel}
          />
        </div>
      </DndContext>
    </Tooltip.Provider>
  );
}
