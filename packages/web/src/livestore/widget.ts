import { Events, Schema, State } from "@livestore/livestore";

export type WidgetKind = "builtin" | "generated";

const WidgetKindSchema = Schema.Literal("builtin", "generated");

export const BUILTIN_WIDGET_KEYS = ["calendar", "todo", "recent"] as const;
export type BuiltinWidgetKey = (typeof BUILTIN_WIDGET_KEYS)[number];

const BuiltinWidgetKeySchema = Schema.Literal(...BUILTIN_WIDGET_KEYS);

export const DATA_SOURCE_NAMES = [
  "recentFiles",
  "todoProgress",
  "storageStats",
  "chatSessionCount",
] as const;
export type DataSourceName = (typeof DATA_SOURCE_NAMES)[number];

const DataSourceNameSchema = Schema.Literal(...DATA_SOURCE_NAMES);

type WidgetDefinitionCreatedEvent = {
  id: string;
  kind: WidgetKind;
  builtinKey?: BuiltinWidgetKey;
  name: string;
  widgetCode?: string;
  dataSourceName: DataSourceName;
  dataSourceParams?: string;
  createdAt: Date;
};

type WidgetDefinitionUpdatedEvent = {
  id: string;
  name?: string;
  dataSourceName?: DataSourceName;
  dataSourceParams?: string;
  updatedAt: Date;
};

type WidgetDefinitionDeletedEvent = {
  id: string;
  deletedAt: Date;
};

type WidgetInstanceCreatedEvent = {
  id: string;
  definitionId: string;
  sortOrder: number;
  params?: string;
  createdAt: Date;
};

type WidgetInstanceUpdatedEvent = {
  id: string;
  params: string;
  updatedAt: Date;
};

type WidgetInstanceReorderedEvent = {
  orderedIds: readonly string[];
  updatedAt: Date;
};

type WidgetInstanceDeletedEvent = {
  id: string;
  deletedAt: Date;
};

export const widgetDefinitionTable = State.SQLite.table({
  name: "widgetDefinitions",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    kind: State.SQLite.text({ default: "generated", schema: WidgetKindSchema }),
    builtinKey: State.SQLite.text({ nullable: true, schema: BuiltinWidgetKeySchema }),
    name: State.SQLite.text({ default: "" }),
    widgetCode: State.SQLite.text({ default: "" }),
    dataSourceName: State.SQLite.text({ default: "recentFiles", schema: DataSourceNameSchema }),
    dataSourceParams: State.SQLite.text({ default: "{}" }),
    createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    deletedAt: State.SQLite.integer({
      nullable: true,
      schema: Schema.DateFromNumber,
    }),
  },
});

export const widgetInstanceTable = State.SQLite.table({
  name: "widgetInstances",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    definitionId: State.SQLite.text({ default: "" }),
    sortOrder: State.SQLite.integer({ default: 0 }),
    params: State.SQLite.text({ default: "{}" }),
    createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    deletedAt: State.SQLite.integer({
      nullable: true,
      schema: Schema.DateFromNumber,
    }),
  },
});

export const widgetEvents = {
  widgetDefinitionCreated: Events.synced({
    name: "v1.WidgetDefinitionCreated",
    schema: Schema.Struct({
      id: Schema.String,
      kind: WidgetKindSchema,
      builtinKey: Schema.optional(BuiltinWidgetKeySchema),
      name: Schema.String,
      widgetCode: Schema.optional(Schema.String),
      dataSourceName: DataSourceNameSchema,
      dataSourceParams: Schema.optional(Schema.String),
      createdAt: Schema.Date,
    }),
  }),
  widgetDefinitionUpdated: Events.synced({
    name: "v1.WidgetDefinitionUpdated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
      dataSourceName: Schema.optional(DataSourceNameSchema),
      dataSourceParams: Schema.optional(Schema.String),
      updatedAt: Schema.Date,
    }),
  }),
  widgetDefinitionDeleted: Events.synced({
    name: "v1.WidgetDefinitionDeleted",
    schema: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.Date,
    }),
  }),
  widgetInstanceCreated: Events.synced({
    name: "v1.WidgetInstanceCreated",
    schema: Schema.Struct({
      id: Schema.String,
      definitionId: Schema.String,
      sortOrder: Schema.Number,
      params: Schema.optional(Schema.String),
      createdAt: Schema.Date,
    }),
  }),
  widgetInstanceUpdated: Events.synced({
    name: "v1.WidgetInstanceUpdated",
    schema: Schema.Struct({
      id: Schema.String,
      params: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  widgetInstanceReordered: Events.synced({
    name: "v1.WidgetInstanceReordered",
    schema: Schema.Struct({
      orderedIds: Schema.Array(Schema.String),
      updatedAt: Schema.Date,
    }),
  }),
  widgetInstanceDeleted: Events.synced({
    name: "v1.WidgetInstanceDeleted",
    schema: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.Date,
    }),
  }),
};

export const widgetMaterializers = {
  "v1.WidgetDefinitionCreated": (event: WidgetDefinitionCreatedEvent) =>
    widgetDefinitionTable.insert({
      id: event.id,
      kind: event.kind,
      builtinKey: event.builtinKey ?? null,
      name: event.name,
      widgetCode: event.widgetCode ?? "",
      dataSourceName: event.dataSourceName,
      dataSourceParams: event.dataSourceParams ?? "{}",
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    }),
  "v1.WidgetDefinitionUpdated": (event: WidgetDefinitionUpdatedEvent) =>
    widgetDefinitionTable
      .update({
        ...(event.name !== undefined ? { name: event.name } : {}),
        ...(event.dataSourceName !== undefined ? { dataSourceName: event.dataSourceName } : {}),
        ...(event.dataSourceParams !== undefined
          ? { dataSourceParams: event.dataSourceParams }
          : {}),
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.WidgetDefinitionDeleted": (event: WidgetDefinitionDeletedEvent) =>
    widgetDefinitionTable
      .update({
        deletedAt: event.deletedAt,
      })
      .where({ id: event.id }),
  "v1.WidgetInstanceCreated": (event: WidgetInstanceCreatedEvent) =>
    widgetInstanceTable.insert({
      id: event.id,
      definitionId: event.definitionId,
      sortOrder: event.sortOrder,
      params: event.params ?? "{}",
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    }),
  "v1.WidgetInstanceUpdated": (event: WidgetInstanceUpdatedEvent) =>
    widgetInstanceTable
      .update({
        params: event.params,
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.WidgetInstanceReordered": (event: WidgetInstanceReorderedEvent) =>
    event.orderedIds.map((id, index) =>
      widgetInstanceTable
        .update({
          sortOrder: index,
          updatedAt: event.updatedAt,
        })
        .where({ id }),
    ),
  "v1.WidgetInstanceDeleted": (event: WidgetInstanceDeletedEvent) =>
    widgetInstanceTable
      .update({
        deletedAt: event.deletedAt,
      })
      .where({ id: event.id }),
};

export type widgetDefinition = typeof widgetDefinitionTable.Type;
export type widgetInstance = typeof widgetInstanceTable.Type;
