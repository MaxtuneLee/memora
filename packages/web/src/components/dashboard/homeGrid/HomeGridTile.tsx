import { useDraggable, useDroppable } from "@dnd-kit/core";
import { XCircleIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useRef } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from "react";

import {
  HOME_GRID_GAP_PX,
  HOME_GRID_MAX_SPAN,
  nextWidgetSpans,
} from "@/lib/widgets/homeGridLayout";

// Shared with AddWidgetDrawer: a card's preview claims this same name for the instance id it's
// about to place, just long enough for the View Transition to morph it into this tile's slot.
export const getHomeGridTileViewTransitionName = (instanceId: string): string =>
  `home-grid-tile-${instanceId}`;

export const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

const wiggleA = stylex.keyframes({
  "0%": { transform: "rotate(-1deg)" },
  "50%": { transform: "rotate(1deg)" },
  "100%": { transform: "rotate(-1deg)" },
});

const wiggleB = stylex.keyframes({
  "0%": { transform: "rotate(1deg)" },
  "50%": { transform: "rotate(-1deg)" },
  "100%": { transform: "rotate(1deg)" },
});

const styles = stylex.create({
  tile: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    position: "relative",
  },
  // The tile's drag/sort transform and the wiggle animation target separate nodes so they don't
  // overwrite one another. Sort animation always excludes the actively dragged tile.
  tileInner: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  },
  editing: { cursor: "grab", touchAction: "none", userSelect: "none" },
  wiggleA: {
    animationDuration: "220ms",
    animationIterationCount: "infinite",
    animationName: wiggleA,
    animationTimingFunction: "ease-in-out",
  },
  wiggleB: {
    animationDuration: "260ms",
    animationIterationCount: "infinite",
    animationName: wiggleB,
    animationTimingFunction: "ease-in-out",
  },
  dragging: { opacity: 0.4 },
  content: { flex: 1, minHeight: 0, overflow: "auto" },
  // Sits over the widget's own content while editing so drag/remove gestures land on the
  // tile instead of being swallowed by buttons, inputs, or links inside the widget.
  contentMask: {
    backgroundColor: "rgba(255, 253, 248, 0.4)",
    inset: 0,
    opacity: 0,
    pointerEvents: "none",
    position: "absolute",
    transition: "opacity 160ms ease-out",
    zIndex: 10,
  },
  contentMaskVisible: { opacity: 1, pointerEvents: "auto" },
  removeBadge: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    borderRadius: 9999,
    color: "#a5493a",
    cursor: "pointer",
    display: "flex",
    height: 24,
    justifyContent: "center",
    left: -8,
    position: "absolute",
    top: -8,
    touchAction: "manipulation",
    width: 24,
    zIndex: 20,
    ":hover": { color: "#7c2f24" },
  },
  removeIcon: { height: 24, width: 24 },
  resizing: { zIndex: 10 },
  resizeHandle: {
    alignItems: "center",
    bottom: 2,
    color: "#8a857c",
    cursor: "nwse-resize",
    display: "flex",
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: 2,
    touchAction: "none",
    width: 20,
    zIndex: 20,
    ":hover": { color: "#4f5742" },
  },
  resizeGrip: { height: 12, width: 12 },
});

export function HomeGridTile({
  id,
  title,
  index,
  isEditing,
  reducedMotion,
  columnSpan,
  rowSpan,
  maxColumnSpan,
  cellSize,
  isResizing,
  isResizingSelf,
  onRemove,
  onEnterEdit,
  onResizePreview,
  onResizeEnd,
  children,
}: {
  id: string;
  title: string;
  index: number;
  isEditing: boolean;
  reducedMotion: boolean;
  /** Stored logical column span, which may exceed the columns the container can currently show. */
  columnSpan: number;
  rowSpan: number;
  maxColumnSpan: number;
  cellSize: number;
  /** Any tile in the grid is mid-resize, which pauses every tile's wiggle. */
  isResizing: boolean;
  isResizingSelf: boolean;
  onRemove: () => void;
  onEnterEdit: () => void;
  onResizePreview: (id: string, columnSpan: number, rowSpan: number) => void;
  onResizeEnd: (id: string, spans: { columnSpan: number; rowSpan: number } | null) => void;
  children: ReactNode;
}): ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
    disabled: !isEditing,
    // The tile wraps interactive widget content, so it must not claim the "button" role
    // dnd-kit defaults to — that would nest an interactive role around other controls and
    // fold their labels into this element's accessible name.
    attributes: { role: "group", roleDescription: "widget" },
  });
  const { setNodeRef: setDropRef } = useDroppable({ id, disabled: !isEditing });

  const visibleColumnSpan = Math.min(columnSpan, maxColumnSpan);
  const style: CSSProperties = {
    gridColumn: `span ${visibleColumnSpan}`,
    gridRow: `span ${Math.min(rowSpan, HOME_GRID_MAX_SPAN)}`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 10 : undefined,
    // Gives the browser's View Transition (triggered on add/remove in DashboardPage) a stable
    // identity per tile, so it morphs each survivor to its new slot instead of cross-fading the
    // whole grid as one block. Reduced motion never starts a transition, so the name is inert.
    viewTransitionName: reducedMotion ? undefined : getHomeGridTileViewTransitionName(id),
  };

  const longPressTimer = useRef<number | null>(null);
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressOrigin.current = null;
  }, []);

  useEffect(() => cancelLongPress, [cancelLongPress]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isEditing || event.button !== 0) {
        return;
      }
      longPressOrigin.current = { x: event.clientX, y: event.clientY };
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        onEnterEdit();
      }, LONG_PRESS_MS);
    },
    [isEditing, onEnterEdit],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = longPressOrigin.current;
      if (!origin) {
        return;
      }
      const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
      if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) {
        cancelLongPress();
      }
    },
    [cancelLongPress],
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isEditing) {
        return;
      }
      event.preventDefault();
      cancelLongPress();
      onEnterEdit();
    },
    [cancelLongPress, isEditing, onEnterEdit],
  );

  // Document-level listeners rather than pointer capture, because the pointer regularly leaves the
  // handle's 20px box within the first few pixels of a drag. Kept in a ref so an unmount mid-gesture
  // (a remove, or leaving edit mode) tears them down instead of leaving them bound to a dead tile.
  const endResizeGestureRef = useRef<((committed: boolean) => void) | null>(null);

  useEffect(() => () => endResizeGestureRef.current?.(false), []);

  const handleResizeMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      // Keeps dnd-kit's MouseSensor — whose listeners are spread onto the tile root while editing —
      // from reading this gesture as the start of a whole-tile reorder drag.
      event.preventDefault();
      event.stopPropagation();
      endResizeGestureRef.current?.(false);

      const startX = event.clientX;
      const startY = event.clientY;
      const cellStride = cellSize + HOME_GRID_GAP_PX;
      let latestSpans: { columnSpan: number; rowSpan: number } | null = null;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const spans = nextWidgetSpans({
          storedColumnSpan: columnSpan,
          storedRowSpan: rowSpan,
          visibleColumnSpan,
          maxColumnSpan,
          cellStride,
          deltaX: moveEvent.clientX - startX,
          deltaY: moveEvent.clientY - startY,
        });
        latestSpans = spans;
        onResizePreview(id, spans.columnSpan, spans.rowSpan);
      };

      const endGesture = (committed: boolean) => {
        endResizeGestureRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("keydown", handleKeyDown);

        const changed =
          latestSpans !== null &&
          (latestSpans.columnSpan !== columnSpan || latestSpans.rowSpan !== rowSpan);
        onResizeEnd(id, committed && changed ? latestSpans : null);
      };

      const handleMouseUp = () => endGesture(true);
      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") {
          endGesture(false);
        }
      };

      endResizeGestureRef.current = endGesture;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("keydown", handleKeyDown);
    },
    [
      cellSize,
      columnSpan,
      id,
      maxColumnSpan,
      onResizeEnd,
      onResizePreview,
      rowSpan,
      visibleColumnSpan,
    ],
  );

  const wiggleStyle = index % 2 === 0 ? styles.wiggleA : styles.wiggleB;

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={style}
      data-widget-instance-id={id}
      onContextMenu={handleContextMenu}
      {...(isEditing
        ? attributes
        : {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: cancelLongPress,
            onPointerLeave: cancelLongPress,
            onPointerCancel: cancelLongPress,
          })}
      {...(isEditing ? listeners : undefined)}
      {...stylex.props(
        styles.tile,
        isEditing && styles.editing,
        isDragging && styles.dragging,
        isResizingSelf && styles.resizing,
      )}
    >
      <div
        {...stylex.props(
          styles.tileInner,
          isEditing && !reducedMotion && !isResizing && wiggleStyle,
        )}
      >
        {isEditing && (
          <button
            type="button"
            onClick={onRemove}
            {...stylex.props(styles.removeBadge)}
            aria-label={`Remove ${title}`}
          >
            <XCircleIcon className={stylex.props(styles.removeIcon).className} weight="fill" />
          </button>
        )}
        <div {...stylex.props(styles.content)}>{children}</div>
        <div
          aria-hidden="true"
          {...stylex.props(styles.contentMask, isEditing && styles.contentMaskVisible)}
        />
        {isEditing && (
          // Mouse-only by design: touch and keyboard resize are out of scope, so this stays out of
          // the tab order and out of the accessibility tree rather than claiming a control it isn't.
          <div
            aria-hidden="true"
            data-resize-handle=""
            onMouseDown={handleResizeMouseDown}
            {...stylex.props(styles.resizeHandle)}
          >
            <svg
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              {...stylex.props(styles.resizeGrip)}
            >
              <path d="M11 5 5 11" />
              <path d="M11 9.5 9.5 11" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
