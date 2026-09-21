import { widgetEvents, type widgetInstance } from "@/livestore/widget";
import { parseJsonRecord } from "./widgetJson";

interface WidgetInstanceStoreLike {
  commit: (...events: unknown[]) => void;
}

export interface CreateWidgetInstanceInput {
  id: string;
  definitionId: string;
  sortOrder: number;
  params?: Record<string, unknown>;
}

// ponytail: active rows keep their sortOrder after a soft delete, so `rows.length` can tie
// with a surviving row's sortOrder. Take the max instead so new placements never collide.
export const nextWidgetInstanceSortOrder = (
  rows: readonly Pick<widgetInstance, "sortOrder">[],
): number => rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

export const createWidgetInstance = ({
  store,
  input,
}: {
  store: WidgetInstanceStoreLike;
  input: CreateWidgetInstanceInput;
}): void => {
  store.commit(
    widgetEvents.widgetInstanceCreated({
      id: input.id,
      definitionId: input.definitionId,
      sortOrder: input.sortOrder,
      params: JSON.stringify(input.params ?? {}),
      createdAt: new Date(),
    }),
  );
};

export const updateWidgetInstanceParams = ({
  store,
  id,
  params,
}: {
  store: WidgetInstanceStoreLike;
  id: string;
  params: Record<string, unknown>;
}): void => {
  store.commit(
    widgetEvents.widgetInstanceUpdated({
      id,
      params: JSON.stringify(params),
      updatedAt: new Date(),
    }),
  );
};

// ponytail: orderedIds must be the full set of active instance ids — entries left out keep
// their previous sortOrder and can collide with the freshly reindexed 0..n-1 range.
export const reorderWidgetInstances = ({
  store,
  orderedIds,
}: {
  store: WidgetInstanceStoreLike;
  orderedIds: string[];
}): void => {
  store.commit(widgetEvents.widgetInstanceReordered({ orderedIds, updatedAt: new Date() }));
};

export const deleteWidgetInstance = ({
  store,
  id,
}: {
  store: WidgetInstanceStoreLike;
  id: string;
}): void => {
  store.commit(widgetEvents.widgetInstanceDeleted({ id, deletedAt: new Date() }));
};

export const restoreWidgetInstance = ({
  store,
  id,
}: {
  store: WidgetInstanceStoreLike;
  id: string;
}): void => {
  store.commit(widgetEvents.widgetInstanceRestored({ id, updatedAt: new Date() }));
};

const MIN_WIDGET_SPAN = 1;
const MAX_WIDGET_SPAN = 4;

const clampWidgetSpan = (value: number): number => {
  const safeValue = Number.isFinite(value) ? Math.round(value) : MIN_WIDGET_SPAN;
  return Math.max(MIN_WIDGET_SPAN, Math.min(MAX_WIDGET_SPAN, safeValue));
};

export const resizeWidgetInstance = ({
  store,
  id,
  columnSpan,
  rowSpan,
  current,
}: {
  store: WidgetInstanceStoreLike;
  id: string;
  columnSpan: number;
  rowSpan: number;
  current: Pick<widgetInstance, "columnSpan" | "rowSpan">;
}): void => {
  const clampedColumnSpan = clampWidgetSpan(columnSpan);
  const clampedRowSpan = clampWidgetSpan(rowSpan);

  if (clampedColumnSpan === current.columnSpan && clampedRowSpan === current.rowSpan) {
    return;
  }

  store.commit(
    widgetEvents.widgetInstanceResized({
      id,
      columnSpan: clampedColumnSpan,
      rowSpan: clampedRowSpan,
      updatedAt: new Date(),
    }),
  );
};

export const parseWidgetInstanceParams = (
  row: Pick<widgetInstance, "params">,
): Record<string, unknown> => parseJsonRecord(row.params);
