import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useCallback, useRef, useState, type ReactElement } from "react";

import { DesktopItem as DesktopItemView } from "@web/components/desktop/DesktopItem";
import { DesktopSurface } from "@web/components/desktop/DesktopSurface";
import {
  DesktopWindow,
  type DesktopWindowPosition,
  type DesktopWindowSize,
} from "@web/components/desktop/DesktopWindow";
import type { DesktopItem, DesktopFolderItem } from "@web/types/desktop";

import { DESKTOP_FOLDERS, FOLDER_FILES } from "../mock/data";

const EMPTY = new Set<string>();
const noop = (): void => {};

// The app's real Desktop pieces on sample files: drag folders around, double-click one to open
// it, move or resize the window. Nothing is stored.
export function Files(): ReactElement {
  const boundsRef = useRef<HTMLDivElement>(null);
  const [folders, setFolders] = useState<DesktopFolderItem[]>(DESKTOP_FOLDERS);
  const [selected, setSelected] = useState<Set<string>>(new Set(["lectures"]));
  const [openId, setOpenId] = useState<string | null>("lectures");
  const [picked, setPicked] = useState<string | null>(null);
  const [position, setPosition] = useState<DesktopWindowPosition>({ x: 150, y: 28 });
  const [size, setSize] = useState<DesktopWindowSize>({ width: 500, height: 340 });

  const openFolder = openId ? folders.find((f) => f.id === openId) : undefined;
  const files = openId ? (FOLDER_FILES[openId] ?? []) : [];
  const pickedFile = files.find((f) => f.id === picked);

  // The item being dragged. Like the app, the original hides while a copy follows the pointer.
  const [dragId, setDragId] = useState<string | null>(null);
  const dragged = dragId ? folders.find((f) => f.id === dragId) : undefined;
  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => setDragId(String(active.id)),
    [],
  );
  const handleDragEnd = useCallback(({ active, delta }: DragEndEvent) => {
    setDragId(null);
    setFolders((prev) =>
      prev.map((f) =>
        f.id === active.id
          ? {
              ...f,
              position: {
                x: Math.max(8, f.position.x + delta.x),
                y: Math.max(8, f.position.y + delta.y),
              },
            }
          : f,
      ),
    );
  }, []);
  const selectFolder = useCallback((id: string) => setSelected(new Set([id])), []);
  const openItem = useCallback((item: DesktopItem) => {
    if (item.type !== "folder") return;
    setOpenId(item.id);
    setPicked(null);
  }, []);
  const pickFile = useCallback((id: string) => setPicked(id), []);

  return (
    <section className="section" id="files">
      <div className="wrap">
        <div className="head reveal">
          <h2>
            Organize your files, <em>in a familiar way.</em>
          </h2>
          <p className="lede">
            Sort lectures, papers, and photos into folders the way you like. Everything is stored
            locally in your browser, so there's nothing to upload.
          </p>
        </div>
        <div className="desk" ref={boundsRef}>
          <DndContext
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDragId(null)}
          >
            <DesktopSurface
              items={folders}
              layout="desktop"
              enableDnD
              selectedIds={selected}
              renamingIds={EMPTY}
              onSelect={selectFolder}
              onContextMenu={noop}
              onOpenItem={openItem}
              onRenameCommit={noop}
              onRenameCancel={noop}
            />
            <DragOverlay dropAnimation={null}>
              {dragged ? (
                <DesktopItemView
                  item={{ ...dragged, position: { x: 0, y: 0 } }}
                  isSelected
                  onSelect={noop}
                  onContextMenu={noop}
                  onOpenItem={noop}
                  layout="grid"
                  draggable={false}
                  showFileIndexStatus={false}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
          {openFolder && (
            <DesktopWindow
              id="folder"
              title={openFolder.name}
              position={position}
              size={size}
              zIndex={10}
              isFocused
              boundsRef={boundsRef}
              onFocus={noop}
              onClose={() => setOpenId(null)}
              onMove={(_, p) => setPosition(p)}
              onResize={(_, s) => setSize(s)}
            >
              <div className="win-body">
                <DndContext>
                  <DesktopSurface
                    items={files}
                    layout="grid"
                    enableDnD={false}
                    selectedIds={picked ? new Set([picked]) : EMPTY}
                    renamingIds={EMPTY}
                    onSelect={pickFile}
                    onContextMenu={noop}
                    onOpenItem={noop}
                    onRenameCommit={noop}
                    onRenameCancel={noop}
                  />
                </DndContext>
              </div>
            </DesktopWindow>
          )}
          <p className="desk-path">
            opfs:/memora{openFolder ? `/${openFolder.name}` : ""}
            {pickedFile ? (
              <>
                /<b>{pickedFile.name}</b>
              </>
            ) : null}
          </p>
        </div>
        <p className="fs-note">Double-click a folder to open it.</p>
      </div>
    </section>
  );
}
