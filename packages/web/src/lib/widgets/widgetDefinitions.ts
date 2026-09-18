import {
  widgetEvents,
  type BuiltinWidgetKey,
  type DataSourceName,
  type WidgetKind,
  type widgetDefinition,
} from "@/livestore/widget";
import { parseJsonRecord } from "./widgetJson";

interface WidgetDefinitionStoreLike {
  commit: (...events: unknown[]) => void;
}

export interface CreateWidgetDefinitionInput {
  id: string;
  kind: WidgetKind;
  name: string;
  widgetCode?: string;
  builtinKey?: BuiltinWidgetKey;
  dataSourceName: DataSourceName;
  dataSourceParams?: Record<string, unknown>;
}

export const createWidgetDefinition = ({
  store,
  input,
}: {
  store: WidgetDefinitionStoreLike;
  input: CreateWidgetDefinitionInput;
}): void => {
  store.commit(
    widgetEvents.widgetDefinitionCreated({
      id: input.id,
      kind: input.kind,
      builtinKey: input.builtinKey,
      name: input.name,
      widgetCode: input.widgetCode,
      dataSourceName: input.dataSourceName,
      dataSourceParams: JSON.stringify(input.dataSourceParams ?? {}),
      createdAt: new Date(),
    }),
  );
};

export interface UpdateWidgetDefinitionInput {
  id: string;
  name?: string;
  dataSourceName?: DataSourceName;
  dataSourceParams?: Record<string, unknown>;
}

export const updateWidgetDefinition = ({
  store,
  input,
}: {
  store: WidgetDefinitionStoreLike;
  input: UpdateWidgetDefinitionInput;
}): void => {
  store.commit(
    widgetEvents.widgetDefinitionUpdated({
      id: input.id,
      name: input.name,
      dataSourceName: input.dataSourceName,
      dataSourceParams:
        input.dataSourceParams !== undefined ? JSON.stringify(input.dataSourceParams) : undefined,
      updatedAt: new Date(),
    }),
  );
};

export const deleteWidgetDefinition = ({
  store,
  id,
}: {
  store: WidgetDefinitionStoreLike;
  id: string;
}): void => {
  store.commit(widgetEvents.widgetDefinitionDeleted({ id, deletedAt: new Date() }));
};

export const parseWidgetDefinitionDataSourceParams = (
  row: Pick<widgetDefinition, "dataSourceParams">,
): Record<string, unknown> => parseJsonRecord(row.dataSourceParams);
