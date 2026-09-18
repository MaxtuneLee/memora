import { expect, test, vi } from "vite-plus/test";

import {
  activeWidgetDefinitionsQuery$,
  activeWidgetInstancesQuery$,
  listResolvedWidgetInstances,
} from "@/lib/widgets/widgetQueries";

const buildInstance = (overrides: Record<string, unknown> = {}) => ({
  id: "inst-1",
  definitionId: "def-1",
  sortOrder: 0,
  params: "{}",
  createdAt: new Date(1_000),
  updatedAt: new Date(1_000),
  deletedAt: null,
  ...overrides,
});

const buildDefinition = (overrides: Record<string, unknown> = {}) => ({
  id: "def-1",
  kind: "generated",
  builtinKey: null,
  name: "Weather",
  dataSourceName: "recentFiles",
  dataSourceParams: "{}",
  createdAt: new Date(1_000),
  updatedAt: new Date(1_000),
  deletedAt: null,
  ...overrides,
});

test("resolves each instance against its definition's current state, not a stored copy", () => {
  const instances = [buildInstance()];
  let definitions = [buildDefinition({ name: "Weather" })];
  const store = {
    query: vi.fn((query: unknown) => {
      if (query === activeWidgetInstancesQuery$) return instances;
      if (query === activeWidgetDefinitionsQuery$) return definitions;
      throw new Error("unexpected query");
    }),
  };

  const first = listResolvedWidgetInstances(store);
  expect(first[0]?.definition?.name).toBe("Weather");

  definitions = [buildDefinition({ name: "Weather (renamed by chat)" })];
  const second = listResolvedWidgetInstances(store);

  expect(second[0]?.definition?.name).toBe("Weather (renamed by chat)");
});

test("resolves a null definition when an instance's definition is missing or soft-deleted", () => {
  const store = {
    query: vi.fn((query: unknown) => {
      if (query === activeWidgetInstancesQuery$) {
        return [buildInstance({ definitionId: "missing" })];
      }
      if (query === activeWidgetDefinitionsQuery$) return [];
      throw new Error("unexpected query");
    }),
  };

  const resolved = listResolvedWidgetInstances(store);

  expect(resolved).toEqual([
    { instance: expect.objectContaining({ id: "inst-1" }), definition: null },
  ]);
});
