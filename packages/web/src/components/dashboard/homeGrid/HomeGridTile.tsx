import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DotsSixVerticalIcon, XIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { CSSProperties, ReactElement, ReactNode } from "react";

const styles = stylex.create({
  tile: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    position: "relative",
  },
  dragging: { opacity: 0.4 },
  dropTarget: { boxShadow: "0 0 0 2px #a7af8f", borderRadius: 27 },
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 4,
    marginBottom: 8,
  },
  content: { flex: 1, minHeight: 0, overflow: "auto" },
  handleButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderStyle: "none",
    borderRadius: 9999,
    color: "#9a948a",
    cursor: "grab",
    display: "flex",
    height: 28,
    justifyContent: "center",
    touchAction: "none",
    width: 28,
    ":hover": { backgroundColor: "#f5f1e8", color: "#4f5742" },
  },
  removeButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderStyle: "none",
    borderRadius: 9999,
    color: "#9a948a",
    cursor: "pointer",
    display: "flex",
    height: 28,
    justifyContent: "center",
    width: 28,
    ":hover": { backgroundColor: "#fdf1ee", color: "#a5493a" },
  },
  icon: { height: 16, width: 16 },
});

export function HomeGridTile({
  id,
  title,
  onRemove,
  children,
}: {
  id: string;
  title: string;
  onRemove: () => void;
  children: ReactNode;
}): ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={style}
      data-widget-instance-id={id}
      {...stylex.props(styles.tile, isDragging && styles.dragging, isOver && styles.dropTarget)}
    >
      <div {...stylex.props(styles.toolbar)}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          {...stylex.props(styles.handleButton)}
          aria-label={`Reorder ${title}`}
        >
          <DotsSixVerticalIcon className={stylex.props(styles.icon).className} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          {...stylex.props(styles.removeButton)}
          aria-label={`Remove ${title} from Home Grid`}
        >
          <XIcon className={stylex.props(styles.icon).className} weight="bold" />
        </button>
      </div>
      <div {...stylex.props(styles.content)}>{children}</div>
    </div>
  );
}
