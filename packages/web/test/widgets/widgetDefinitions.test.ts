import { expect, test, vi } from "vite-plus/test";

import { widgetEvents } from "@/livestore/widget";
import {
  createWidgetDefinition,
  deleteWidgetDefinition,
  parseWidgetDefinitionDataSourceParams,
  updateWidgetDefinition,
} from "@/lib/widgets/widgetDefinitions";

test("commits a v1.WidgetDefinitionCreated event for a builtin definition", () => {
  const store = { commit: vi.fn() };

  createWidgetDefinition({
    store,
    input: {
      id: "def-calendar",
      kind: "builtin",
      builtinKey: "calendar",
      name: "Calendar",
      dataSourceName: "todoProgress",
    },
  });

  expect(store.commit).toHaveBeenCalledTimes(1);
  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetDefinitionCreated",
    args: {
      id: "def-calendar",
      kind: "builtin",
      builtinKey: "calendar",
      name: "Calendar",
      dataSourceName: "todoProgress",
      dataSourceParams: "{}",
    },
  });
  expect(committed?.args.createdAt).toBeInstanceOf(Date);
});

test("commits a v1.WidgetDefinitionCreated event for a generated definition with data source params", () => {
  const store = { commit: vi.fn() };

  createWidgetDefinition({
    store,
    input: {
      id: "def-generated",
      kind: "generated",
      name: "Weather",
      dataSourceName: "recentFiles",
      dataSourceParams: { limit: 3 },
    },
  });

  expect(store.commit).toHaveBeenCalledWith(
    widgetEvents.widgetDefinitionCreated({
      id: "def-generated",
      kind: "generated",
      builtinKey: undefined,
      name: "Weather",
      dataSourceName: "recentFiles",
      dataSourceParams: JSON.stringify({ limit: 3 }),
      createdAt: store.commit.mock.calls[0]?.[0]?.args.createdAt,
    }),
  );
});

test("commits a v1.WidgetDefinitionUpdated event with only the changed fields", () => {
  const store = { commit: vi.fn() };

  updateWidgetDefinition({
    store,
    input: {
      id: "def-generated",
      name: "Weather (updated)",
    },
  });

  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetDefinitionUpdated",
    args: {
      id: "def-generated",
      name: "Weather (updated)",
      dataSourceName: undefined,
      dataSourceParams: undefined,
    },
  });
  expect(committed?.args.updatedAt).toBeInstanceOf(Date);
});

test("commits a v1.WidgetDefinitionDeleted event", () => {
  const store = { commit: vi.fn() };

  deleteWidgetDefinition({ store, id: "def-generated" });

  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetDefinitionDeleted",
    args: { id: "def-generated" },
  });
  expect(committed?.args.deletedAt).toBeInstanceOf(Date);
});

test("parses stored data source params, falling back to an empty object", () => {
  expect(
    parseWidgetDefinitionDataSourceParams({ dataSourceParams: JSON.stringify({ limit: 3 }) }),
  ).toEqual({ limit: 3 });
  expect(parseWidgetDefinitionDataSourceParams({ dataSourceParams: "not json" })).toEqual({});
  expect(parseWidgetDefinitionDataSourceParams({ dataSourceParams: "42" })).toEqual({});
});
