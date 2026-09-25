import { XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import * as stylex from "@stylexjs/stylex";

import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  window: {
    backdropFilter: "blur(4px)",
    backgroundColor: tokens.surface,
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowMedium,
    position: "absolute",
    transition: "box-shadow 150ms",
  },
  focusedWindow: { borderColor: tokens.borderStrong, boxShadow: tokens.shadowLarge },
  idleWindow: { borderColor: tokens.border },
  header: {
    alignItems: "center",
    backgroundImage: `linear-gradient(to bottom, ${tokens.surface}, ${tokens.surfaceSoft})`,
    borderBottom: `1px solid ${tokens.border}`,
    borderRadius: "12px 12px 0 0",
    cursor: "grab",
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 8,
    paddingInline: 12,
  },
  headerTitle: { alignItems: "center", display: "flex", gap: 8, minWidth: 0 },
  closeButton: {
    alignItems: "center",
    backgroundColor: tokens.border,
    borderRadius: 9999,
    color: tokens.textMuted,
    display: "flex",
    height: 16,
    justifyContent: "center",
    transition: "background-color 150ms",
    width: 16,
    ":hover": { backgroundColor: tokens.borderStrong },
  },
  closeIcon: { height: 12, width: 12 },
  title: {
    color: tokens.text,
    fontSize: "0.75rem",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerActions: { alignItems: "center", display: "flex", gap: 8 },
  content: {
    borderRadius: "0 0 12px 12px",
    height: "calc(100% - 40px)",
    overflow: "hidden",
    position: "relative",
  },
  resizeHandle: {
    backgroundColor: tokens.hover,
    border: `1px solid ${tokens.borderStrong}`,
    borderRadius: 2,
    bottom: 4,
    cursor: "se-resize",
    height: 16,
    opacity: 0,
    position: "absolute",
    right: 4,
    width: 16,
  },
});

export interface DesktopWindowPosition {
  x: number;
  y: number;
}

export interface DesktopWindowSize {
  width: number;
  height: number;
}

interface DesktopWindowProps {
  id: string;
  title: string;
  position: DesktopWindowPosition;
  size: DesktopWindowSize;
  zIndex: number;
  isFocused: boolean;
  boundsRef: RefObject<HTMLDivElement | null>;
  headerActions?: ReactNode;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMove: (id: string, position: DesktopWindowPosition) => void;
  onResize: (id: string, size: DesktopWindowSize) => void;
  children: ReactNode;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;

export function DesktopWindow({
  id,
  title,
  position,
  size,
  zIndex,
  isFocused,
  boundsRef,
  headerActions,
  onFocus,
  onClose,
  onMove,
  onResize,
  children,
}: DesktopWindowProps) {
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    startX: number;
    startY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);

  const clampPosition = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const bounds = boundsRef.current;
      if (!bounds) return { x, y };
      const maxX = Math.max(0, bounds.clientWidth - width);
      const maxY = Math.max(0, bounds.clientHeight - height);
      return {
        x: Math.min(Math.max(0, x), maxX),
        y: Math.min(Math.max(0, y), maxY),
      };
    },
    [boundsRef],
  );

  const clampSize = useCallback(
    (width: number, height: number, x: number, y: number) => {
      const bounds = boundsRef.current;
      if (!bounds) return { width, height };
      const maxWidth = Math.max(MIN_WIDTH, bounds.clientWidth - x);
      const maxHeight = Math.max(MIN_HEIGHT, bounds.clientHeight - y);
      return {
        width: Math.min(Math.max(MIN_WIDTH, width), maxWidth),
        height: Math.min(Math.max(MIN_HEIGHT, height), maxHeight),
      };
    },
    [boundsRef],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (dragStateRef.current) {
        const { startX, startY, originX, originY } = dragStateRef.current;
        const nextX = originX + (event.clientX - startX);
        const nextY = originY + (event.clientY - startY);
        const clamped = clampPosition(nextX, nextY, size.width, size.height);
        onMove(id, clamped);
      }
      if (resizeStateRef.current) {
        const { startX, startY, originWidth, originHeight } = resizeStateRef.current;
        const nextWidth = originWidth + (event.clientX - startX);
        const nextHeight = originHeight + (event.clientY - startY);
        const clamped = clampSize(nextWidth, nextHeight, position.x, position.y);
        onResize(id, clamped);
      }
    },
    [
      clampPosition,
      clampSize,
      id,
      onMove,
      onResize,
      position.x,
      position.y,
      size.height,
      size.width,
    ],
  );

  const handlePointerUp = useCallback(() => {
    dragStateRef.current = null;
    resizeStateRef.current = null;
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const handleDragStart = (event: React.PointerEvent) => {
    event.stopPropagation();
    onFocus(id);
    document.body.style.userSelect = "none";
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  const handleResizeStart = (event: React.PointerEvent) => {
    event.stopPropagation();
    onFocus(id);
    document.body.style.userSelect = "none";
    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originWidth: size.width,
      originHeight: size.height,
    };
  };

  return (
    <div
      {...stylex.props(styles.window, isFocused ? styles.focusedWindow : styles.idleWindow)}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
      }}
      onPointerDown={() => onFocus(id)}
      onContextMenu={(event) => {
        event.stopPropagation();
      }}
    >
      <div {...stylex.props(styles.header)} onPointerDown={handleDragStart}>
        <div {...stylex.props(styles.headerTitle)}>
          <button
            type="button"
            {...stylex.props(styles.closeButton)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onClose(id)}
            aria-label="Close window"
          >
            <XIcon {...stylex.props(styles.closeIcon)} weight="bold" />
          </button>
          <span {...stylex.props(styles.title)}>{title}</span>
        </div>
        {headerActions && (
          <div
            {...stylex.props(styles.headerActions)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
      </div>

      <div {...stylex.props(styles.content)}>{children}</div>

      <div {...stylex.props(styles.resizeHandle)} onPointerDown={handleResizeStart} />
    </div>
  );
}
