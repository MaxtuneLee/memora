import { queryDb } from "@livestore/livestore";

import {
  widgetDefinitionTable,
  widgetInstanceTable,
  type widgetDefinition,
  type widgetInstance,
} from "@/livestore/widget";
import type { WidgetQueryableStore } from "./widgetStore";

export const activeWidgetDefinitionsQuery$ = queryDb(
  () => widgetDefinitionTable.where({ deletedAt: null }),
  { label: "widgets:active-definitions" },
);

export const activeWidgetInstancesQuery$ = queryDb(
  () => widgetInstanceTable.where({ deletedAt: null }).orderBy("sortOrder", "asc"),
  { label: "widgets:active-instances" },
);

export interface ResolvedWidgetInstance {
  instance: widgetInstance;
  definition: widgetDefinition | null;
}

export const listResolvedWidgetInstances = (
  store: WidgetQueryableStore,
): ResolvedWidgetInstance[] => {
  const instances = store.query(activeWidgetInstancesQuery$) as readonly widgetInstance[];
  const definitions = store.query(activeWidgetDefinitionsQuery$) as readonly widgetDefinition[];
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));

  return instances.map((instance) => ({
    instance,
    definition: definitionsById.get(instance.definitionId) ?? null,
  }));
};
