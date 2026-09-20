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
  dropTarget: { boxShadow: "0 0 0 2px #a7af8f", borderRadius: 27 },
  content: { flex: 1, minHeight: 0, overflow: "auto" },
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
});

export function HomeGridTile({
  id,
  title,
  index,
  isEditing,
  reducedMotion,
  onRemove,
  onEnterEdit,
  children,
}: {
  id: string;
  title: string;
  index: number;
  isEditing: boolean;
  reducedMotion: boolean;
  onRemove: () => void;
  onEnterEdit: () => void;
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
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id, disabled: !isEditing });

  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 10 : undefined,
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
        isEditing && !reducedMotion && wiggleStyle,
        isDragging && styles.dragging,
        isOver && styles.dropTarget,
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
    </div>
  );
}
