import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { tokens } from "../../../styles/stylex.stylex";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import {
  HOME_GRID_GAP_PX,
  HOME_GRID_MAX_SPAN,
  homeGridCellSize,
  homeGridColumnCount,
} from "@/lib/widgets/homeGridLayout";
import type { ResolvedWidgetInstance } from "@/lib/widgets/widgetQueries";

import { HomeGridTile } from "./HomeGridTile";

const styles = stylex.create({
  grid: {
    display: "grid",
    // Square cells packed row-major: `dense` lets a later 1x1 backfill a gap a wider tile left
    // behind, which is what keeps the grid compact without storing row/column coordinates.
    // The gap, column count and row height are set inline below: StyleX needs literals, and the
    // gap has to stay the same value the cell maths in homeGridLayout divides by.
    gridAutoFlow: "row dense",
  },
  empty: {
    backgroundColor: tokens.surface,
    border: `1px dashed ${tokens.border}`,
    borderRadius: 28,
    color: tokens.textMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: 14,
    gap: 16,
    paddingBlock: 32,
    paddingInline: 24,
    textAlign: "center",
  },
  toolbar: { display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 16 },
  addButton: {
    alignSelf: "center",
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 9999,
    color: tokens.oliveText,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    paddingBlock: 8,
    paddingInline: 16,
    ":hover": { backgroundColor: tokens.hover },
  },
  doneButton: {
    backgroundColor: tokens.oliveText,
    border: `1px solid ${tokens.oliveText}`,
    borderRadius: 9999,
    color: tokens.textInverse,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    paddingBlock: 8,
    paddingInline: 16,
    ":hover": { backgroundColor: `color-mix(in srgb, ${tokens.oliveText} 82%, black)` },
  },
});

const arrayMove = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const SORT_ANIMATION_DURATION_MS = 220;
const SORT_ANIMATION_EASING = "cubic-bezier(0.77, 0, 0.175, 1)";

export function HomeGrid({
  tiles,
  renderWidget,
  onReorder,
  onRemove,
  onResize,
  onAddWidget,
  isEditing: controlledIsEditing,
  onEditingChange,
  showToolbar = true,
  reducedMotion = false,
}: {
  tiles: ResolvedWidgetInstance[];
  renderWidget: (definition: widgetDefinition, instance: widgetInstance) => ReactNode;
  onReorder: (orderedIds: string[]) => void;
  onRemove: (instanceId: string) => void;
  onResize?: (instanceId: string, columnSpan: number, rowSpan: number) => void;
  onAddWidget?: () => void;
  isEditing?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
  showToolbar?: boolean;
  reducedMotion?: boolean;
}): ReactElement {
  const [uncontrolledIsEditing, setUncontrolledIsEditing] = useState(false);
  const isEditing = controlledIsEditing ?? uncontrolledIsEditing;
  const setIsEditing = useCallback(
    (nextIsEditing: boolean) => {
      if (controlledIsEditing === undefined) {
        setUncontrolledIsEditing(nextIsEditing);
      }
      onEditingChange?.(nextIsEditing);
    },
    [controlledIsEditing, onEditingChange],
  );
  // Live preview order while dragging, so neighbours shift immediately instead of only
  // jumping once the drop commits the reorder to the store.
  const [liveOrderIds, setLiveOrderIds] = useState<string[] | null>(null);
  const liveOrderIdsRef = useRef<string[] | null>(null);
  const activeDragIdRef = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const previousTilePositionsRef = useRef<Map<string, DOMRect> | null>(null);
  const sortAnimationsRef = useRef<Map<string, Animation>>(new Map());
  // Transient spans for the tile being resized, so the tile and every neighbour reflow during the
  // drag. Only the release commits, so a gesture that ends where it started writes nothing.
  const [resizePreview, setResizePreview] = useState<{
    id: string;
    columnSpan: number;
    rowSpan: number;
  } | null>(null);
  const resizePreviewRef = useRef<typeof resizePreview>(null);
  const activeResizeIdRef = useRef<string | null>(null);

  const placedTiles = tiles.filter(
    (tile): tile is { instance: widgetInstance; definition: widgetDefinition } =>
      tile.definition !== null,
  );
  const hasPlacedTiles = placedTiles.length > 0;

  // Columns follow the grid's own width rather than the viewport, because the Home Grid sits in a
  // padded content column that tops out well below the window width.
  const [layout, setLayout] = useState({ columnCount: HOME_GRID_MAX_SPAN, cellSize: 0 });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }

    const measure = (width: number) => {
      const columnCount = homeGridColumnCount(width);
      const cellSize = homeGridCellSize(width, columnCount);
      setLayout((current) =>
        current.columnCount === columnCount && current.cellSize === cellSize
          ? current
          : { columnCount, cellSize },
      );
    };

    // Measured synchronously first so the initial paint already uses the right column count;
    // ResizeObserver only fires on the next frame.
    measure(grid.clientWidth);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(grid);
    return () => observer.disconnect();
  }, [hasPlacedTiles]);

  const maxColumnSpan = Math.min(layout.columnCount, HOME_GRID_MAX_SPAN);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const readTilePositions = useCallback((): Map<string, DOMRect> => {
    const positions = new Map<string, DOMRect>();
    gridRef.current?.querySelectorAll<HTMLElement>("[data-widget-instance-id]").forEach((tile) => {
      const id = tile.dataset.widgetInstanceId;
      if (id) {
        positions.set(id, tile.getBoundingClientRect());
      }
    });
    return positions;
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const initialOrder = placedTiles.map((tile) => tile.instance.id);
      console.debug("[DEBUG-homegrid-sort] start", event.active.id, initialOrder);
      activeDragIdRef.current = event.active.id as string;
      liveOrderIdsRef.current = initialOrder;
      setLiveOrderIds(initialOrder);
    },
    [placedTiles],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      const current = liveOrderIdsRef.current;
      console.debug("[DEBUG-homegrid-sort] over", active.id, over?.id, current);
      if (!over || !current) {
        return;
      }
      const fromIndex = current.indexOf(active.id as string);
      const toIndex = current.indexOf(over.id as string);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return;
      }

      previousTilePositionsRef.current = readTilePositions();
      const nextOrder = arrayMove(current, fromIndex, toIndex);
      liveOrderIdsRef.current = nextOrder;
      setLiveOrderIds(nextOrder);
    },
    [readTilePositions],
  );

  useLayoutEffect(() => {
    const previousPositions = previousTilePositionsRef.current;
    previousTilePositionsRef.current = null;
    if (!previousPositions) {
      return;
    }

    sortAnimationsRef.current.forEach((animation) => animation.cancel());
    sortAnimationsRef.current.clear();
    if (reducedMotion) {
      return;
    }

    gridRef.current?.querySelectorAll<HTMLElement>("[data-widget-instance-id]").forEach((tile) => {
      const id = tile.dataset.widgetInstanceId;
      if (!id || id === activeDragIdRef.current || id === activeResizeIdRef.current) {
        return;
      }

      const previousPosition = previousPositions.get(id);
      if (!previousPosition) {
        return;
      }

      const nextPosition = tile.getBoundingClientRect();
      const deltaX = previousPosition.left - nextPosition.left;
      const deltaY = previousPosition.top - nextPosition.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
        return;
      }

      const animation = tile.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: SORT_ANIMATION_DURATION_MS,
          easing: SORT_ANIMATION_EASING,
        },
      );
      sortAnimationsRef.current.set(id, animation);
      animation.addEventListener(
        "finish",
        () => {
          if (sortAnimationsRef.current.get(id) === animation) {
            sortAnimationsRef.current.delete(id);
          }
        },
        { once: true },
      );
    });
  }, [liveOrderIds, reducedMotion, resizePreview]);

  useEffect(
    () => () => {
      sortAnimationsRef.current.forEach((animation) => animation.cancel());
      sortAnimationsRef.current.clear();
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    const finalOrder = liveOrderIdsRef.current;
    console.debug("[DEBUG-homegrid-sort] end", finalOrder);
    liveOrderIdsRef.current = null;
    activeDragIdRef.current = null;
    setLiveOrderIds(null);
    if (!finalOrder) {
      return;
    }

    const originalOrder = placedTiles.map((tile) => tile.instance.id);
    const changed = finalOrder.some((id, index) => id !== originalOrder[index]);
    if (changed) {
      onReorder(finalOrder);
    }
  }, [onReorder, placedTiles]);

  const handleDragCancel = useCallback(() => {
    liveOrderIdsRef.current = null;
    activeDragIdRef.current = null;
    setLiveOrderIds(null);
  }, []);

  const handleResizePreview = useCallback(
    (id: string, columnSpan: number, rowSpan: number) => {
      const current = resizePreviewRef.current;
      if (
        current &&
        current.id === id &&
        current.columnSpan === columnSpan &&
        current.rowSpan === rowSpan
      ) {
        return;
      }

      previousTilePositionsRef.current = readTilePositions();
      activeResizeIdRef.current = id;
      const next = { id, columnSpan, rowSpan };
      resizePreviewRef.current = next;
      setResizePreview(next);
    },
    [readTilePositions],
  );

  const handleResizeEnd = useCallback(
    (id: string, spans: { columnSpan: number; rowSpan: number } | null) => {
      // Snapshot before dropping the preview so a cancelled gesture animates back rather than
      // snapping; a committed one lands on the same rects and the FLIP pass skips it.
      previousTilePositionsRef.current = readTilePositions();
      resizePreviewRef.current = null;
      activeResizeIdRef.current = null;
      setResizePreview(null);
      if (spans) {
        onResize?.(id, spans.columnSpan, spans.rowSpan);
      }
    },
    [onResize, readTilePositions],
  );

  const orderedTiles = liveOrderIds
    ? liveOrderIds
        .map((id) => placedTiles.find((tile) => tile.instance.id === id))
        .filter((tile): tile is (typeof placedTiles)[number] => tile !== undefined)
    : placedTiles;

  if (placedTiles.length === 0) {
    return (
      <div {...stylex.props(styles.empty)}>
        <span>No widgets yet.</span>
        {onAddWidget && (
          <button type="button" onClick={onAddWidget} {...stylex.props(styles.addButton)}>
            Add widget
          </button>
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {showToolbar && (
        <div {...stylex.props(styles.toolbar)}>
          {isEditing ? (
            <>
              {onAddWidget && (
                <button type="button" onClick={onAddWidget} {...stylex.props(styles.addButton)}>
                  Add widget
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                {...stylex.props(styles.doneButton)}
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              {...stylex.props(styles.addButton)}
            >
              Edit
            </button>
          )}
        </div>
      )}
      <div
        ref={gridRef}
        {...stylex.props(styles.grid)}
        style={{
          gap: HOME_GRID_GAP_PX,
          gridTemplateColumns: `repeat(${layout.columnCount}, minmax(0, 1fr))`,
          gridAutoRows: layout.cellSize > 0 ? `${layout.cellSize}px` : undefined,
        }}
      >
        {orderedTiles.map(({ instance, definition }, index) => {
          const preview = resizePreview?.id === instance.id ? resizePreview : null;

          return (
            <HomeGridTile
              key={instance.id}
              id={instance.id}
              title={definition.name}
              index={index}
              isEditing={isEditing}
              reducedMotion={reducedMotion}
              columnSpan={preview?.columnSpan ?? instance.columnSpan}
              rowSpan={preview?.rowSpan ?? instance.rowSpan}
              maxColumnSpan={maxColumnSpan}
              cellSize={layout.cellSize}
              isResizing={resizePreview !== null}
              isResizingSelf={preview !== null}
              onRemove={() => onRemove(instance.id)}
              onEnterEdit={() => setIsEditing(true)}
              onResizePreview={handleResizePreview}
              onResizeEnd={handleResizeEnd}
            >
              {renderWidget(definition, instance)}
            </HomeGridTile>
          );
        })}
      </div>
    </DndContext>
  );
}
