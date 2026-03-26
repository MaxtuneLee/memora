import { XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

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
      className={`absolute rounded-xl border bg-white shadow-xl backdrop-blur-sm transition-shadow ${
        isFocused ? "border-zinc-300 shadow-2xl" : "border-zinc-200 shadow-lg"
      }`}
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
      <div
        className="flex items-center justify-between rounded-t-xl border-b border-zinc-200 bg-gradient-to-b from-white to-zinc-50 px-3 py-2 cursor-grab"
        onPointerDown={handleDragStart}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="flex size-4 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 transition hover:bg-zinc-300"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onClose(id)}
            aria-label="Close window"
          >
            <XIcon className="size-3" weight="bold" />
          </button>
          <span className="truncate text-xs font-semibold text-zinc-700">{title}</span>
        </div>
        {headerActions && (
          <div
            className="flex items-center gap-2"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
      </div>

      <div className="relative h-[calc(100%-40px)] overflow-hidden rounded-b-xl">{children}</div>

      <div
        className="absolute bottom-1 right-1 size-4 cursor-se-resize rounded-sm border border-zinc-300 bg-zinc-100 opacity-0"
        onPointerDown={handleResizeStart}
      />
    </div>
  );
}
