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

export const parseWidgetInstanceParams = (
  row: Pick<widgetInstance, "params">,
): Record<string, unknown> => parseJsonRecord(row.params);
