import { Menu } from "@base-ui/react/menu";
import { useMemo, useCallback } from "react";
import * as stylex from "@stylexjs/stylex";
import {
  FileTextIcon,
  FolderPlusIcon,
  PencilSimpleIcon,
  TrashIcon,
  UploadIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import type { Position } from "@/types/desktop";

const menuEnter = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0.95)" },
  to: { opacity: 1, transform: "scale(1)" },
});

const styles = stylex.create({
  positioner: { zIndex: 30 },
  popup: {
    animationDuration: "100ms",
    animationName: menuEnter,
    backdropFilter: "blur(12px)",
    backgroundColor: "rgb(255 255 255 / 0.95)",
    borderColor: "#e4e4e7",
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
    minWidth: 180,
    padding: 6,
  },
  item: {
    alignItems: "center",
    borderRadius: 8,
    color: "#3f3f46",
    cursor: "pointer",
    display: "flex",
    fontSize: "0.875rem",
    gap: 8,
    outline: "none",
    paddingBlock: 8,
    paddingInline: 12,
    transition: "background-color 150ms, color 150ms",
    width: "100%",
    "[data-highlighted]": { backgroundColor: "#f4f4f5", color: "#18181b" },
  },
  deleteItem: {
    alignItems: "center",
    borderRadius: 8,
    color: "#3f3f46",
    cursor: "pointer",
    display: "flex",
    fontSize: "0.875rem",
    gap: 8,
    outline: "none",
    paddingBlock: 8,
    paddingInline: 12,
    transition: "background-color 150ms, color 150ms",
    width: "100%",
    "[data-highlighted]": { backgroundColor: "#fef2f2", color: "#dc2626" },
  },
  icon: { color: "#a1a1aa", height: 16, width: 16 },
  deleteIcon: { color: "#dc2626", height: 16, width: 16 },
  separator: { backgroundColor: "#f4f4f5", height: 1, marginBlock: 4 },
});

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
  onReindex?: () => void;
}

const menuItemClassName = stylex.props(styles.item).className;
const deleteItemClassName = stylex.props(styles.deleteItem).className;

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
  onReindex,
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
    >
      {" "}
      <Menu.Portal>
        <Menu.Positioner
          {...stylex.props(styles.positioner)}
          anchor={virtualAnchor}
          side="bottom"
          align="start"
          sideOffset={0}
          alignOffset={0}
        >
          <Menu.Popup {...stylex.props(styles.popup)} onClick={handlePopupClick}>
            {isDesktopMenu ? (
              <>
                <Menu.Item className={menuItemClassName} onClick={onNewFolder}>
                  <FolderPlusIcon {...stylex.props(styles.icon)} />
                  <span>New Folder</span>
                </Menu.Item>
                <Menu.Separator {...stylex.props(styles.separator)} />
                <Menu.Item className={menuItemClassName} onClick={onNewNote}>
                  <FileTextIcon {...stylex.props(styles.icon)} />
                  <span>New Note</span>
                </Menu.Item>
                <Menu.Separator {...stylex.props(styles.separator)} />
                <Menu.Item className={menuItemClassName} onClick={onUploadAudio}>
                  <UploadIcon {...stylex.props(styles.icon)} />
                  <span>Upload File</span>
                </Menu.Item>
              </>
            ) : (
              <>
                <Menu.Item className={menuItemClassName} onClick={onRename}>
                  <PencilSimpleIcon {...stylex.props(styles.icon)} />
                  <span>Rename</span>
                </Menu.Item>
                {onOpenInNewWindow && (
                  <Menu.Item className={menuItemClassName} onClick={onOpenInNewWindow}>
                    <FolderPlusIcon {...stylex.props(styles.icon)} />
                    <span>Open in New Window</span>
                  </Menu.Item>
                )}
                {targetType === "file" && onReindex ? (
                  <Menu.Item className={menuItemClassName} onClick={onReindex}>
                    <ArrowClockwiseIcon {...stylex.props(styles.icon)} />
                    <span>Reindex file</span>
                  </Menu.Item>
                ) : null}
                <Menu.Separator {...stylex.props(styles.separator)} />
                <Menu.Item className={deleteItemClassName} onClick={onDelete}>
                  <TrashIcon {...stylex.props(styles.deleteIcon)} />
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
