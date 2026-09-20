import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragOverEvent,
} from "@dnd-kit/core";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { ResolvedWidgetInstance } from "@/lib/widgets/widgetQueries";

import { HomeGridTile } from "./HomeGridTile";

const styles = stylex.create({
  grid: {
    display: "grid",
    gap: 20,
    gridAutoRows: "23rem",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  },
  empty: {
    backgroundColor: "#fffdf8",
    border: "1px dashed #e9e5dc",
    borderRadius: 28,
    color: "#716c64",
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
    backgroundColor: "#fffdf8",
    border: "1px solid #e9e5dc",
    borderRadius: 9999,
    color: "#4f5742",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    paddingBlock: 8,
    paddingInline: 16,
    ":hover": { backgroundColor: "#f5f1e8" },
  },
  doneButton: {
    backgroundColor: "#4f5742",
    border: "1px solid #4f5742",
    borderRadius: 9999,
    color: "#fffdf8",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    paddingBlock: 8,
    paddingInline: 16,
    ":hover": { backgroundColor: "#3d4433" },
  },
});

const arrayMove = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export function HomeGrid({
  tiles,
  renderWidget,
  onReorder,
  onRemove,
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

  const placedTiles = tiles.filter(
    (tile): tile is { instance: widgetInstance; definition: widgetDefinition } =>
      tile.definition !== null,
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragStart = useCallback(() => {
    setLiveOrderIds(placedTiles.map((tile) => tile.instance.id));
  }, [placedTiles]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }

    setLiveOrderIds((current) => {
      if (!current) {
        return current;
      }
      const fromIndex = current.indexOf(active.id as string);
      const toIndex = current.indexOf(over.id as string);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return current;
      }
      return arrayMove(current, fromIndex, toIndex);
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    const finalOrder = liveOrderIds;
    setLiveOrderIds(null);
    if (!finalOrder) {
      return;
    }

    const originalOrder = placedTiles.map((tile) => tile.instance.id);
    const changed = finalOrder.some((id, index) => id !== originalOrder[index]);
    if (changed) {
      onReorder(finalOrder);
    }
  }, [liveOrderIds, onReorder, placedTiles]);

  const handleDragCancel = useCallback(() => {
    setLiveOrderIds(null);
  }, []);

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
      <div {...stylex.props(styles.grid)}>
        {orderedTiles.map(({ instance, definition }, index) => (
          <HomeGridTile
            key={instance.id}
            id={instance.id}
            title={definition.name}
            index={index}
            isEditing={isEditing}
            isReordering={liveOrderIds !== null}
            reducedMotion={reducedMotion}
            onRemove={() => onRemove(instance.id)}
            onEnterEdit={() => setIsEditing(true)}
          >
            {renderWidget(definition, instance)}
          </HomeGridTile>
        ))}
      </div>
    </DndContext>
  );
}
