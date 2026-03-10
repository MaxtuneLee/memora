import { Menu } from "@base-ui/react/menu";
import { useMemo, useCallback } from "react";
import {
  FileTextIcon,
  FolderPlusIcon,
  PencilSimpleIcon,
  TrashIcon,
  UploadIcon,
} from "@phosphor-icons/react";
import type { Position } from "./desktopTypes";

interface DesktopContextMenuProps {
  isOpen: boolean;
  position: Position;
  targetId: string | null;
  targetType?: "file" | "folder" | "widget" | null;
  onClose: () => void;
  onNewFolder: () => void;
  onNewNote: () => void;
  onUploadAudio: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onOpenInNewWindow?: () => void;
}

const menuItemClassName =
  "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900 cursor-pointer";

const deleteItemClassName =
  "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-red-50 data-[highlighted]:text-red-600 cursor-pointer";

export function DesktopContextMenu({
  isOpen,
  position,
  targetId,
  targetType,
  onClose,
  onNewFolder,
  onNewNote,
  onUploadAudio,
  onRename,
  onDelete,
  onOpenInNewWindow,
}: DesktopContextMenuProps) {
  const isDesktopMenu = targetId === null || targetType === "widget";

  // Create a virtual anchor element at the cursor position
  const virtualAnchor = useMemo(() => {
    return {
      getBoundingClientRect: () => ({
        x: position.x,
        y: position.y,
        width: 0,
        height: 0,
        top: position.y,
        right: position.x,
        bottom: position.y,
        left: position.x,
        toJSON: () => ({}),
      }),
    };
  }, [position.x, position.y]);

  // Stop propagation to prevent desktop click handler from closing immediately
  const handlePopupClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  return (
    <Menu.Root
      open={isOpen}
      onOpenChange={(open, event) => {
        if (!open) {
          const reason = event.reason;
          if (reason === "outside-press" || reason === "escape-key" || reason === "item-press") {
            onClose();
          }
        }
      }}
    >      <Menu.Portal>
        <Menu.Positioner
          className="z-30"
          anchor={virtualAnchor}
          side="bottom"
          align="start"
          sideOffset={0}
          alignOffset={0}
        >
          <Menu.Popup 
            className="min-w-[180px] rounded-xl border border-zinc-200 bg-white/95 backdrop-blur-md p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100"
            onClick={handlePopupClick}
          >
            {isDesktopMenu ? (
              <>
                <Menu.Item
                  className={menuItemClassName}
                  onClick={onNewFolder}
                >
                  <FolderPlusIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                  <span>New Folder</span>
                </Menu.Item>
                <Menu.Separator className="my-1 h-px bg-zinc-100" />
                <Menu.Item
                  className={menuItemClassName}
                  onClick={onNewNote}
                >
                  <FileTextIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                  <span>New Note</span>
                </Menu.Item>
                <Menu.Separator className="my-1 h-px bg-zinc-100" />
                <Menu.Item
                  className={menuItemClassName}
                  onClick={onUploadAudio}
                >
                  <UploadIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                  <span>Upload File</span>
                </Menu.Item>
              </>
            ) : (
              <>
                <Menu.Item
                  className={menuItemClassName}
                  onClick={onRename}
                >
                  <PencilSimpleIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                  <span>Rename</span>
                </Menu.Item>
                {onOpenInNewWindow && (
                  <Menu.Item
                    className={menuItemClassName}
                    onClick={onOpenInNewWindow}
                  >
                    <FolderPlusIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                    <span>Open in New Window</span>
                  </Menu.Item>
                )}
                <Menu.Separator className="my-1 h-px bg-zinc-100" />
                <Menu.Item
                  className={deleteItemClassName}
                  onClick={onDelete}
                >
                  <TrashIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-red-600" />
                  <span>Delete</span>
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
