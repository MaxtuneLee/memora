import { expect, test, vi } from "vite-plus/test";

import {
  createWidgetInstance,
  deleteWidgetInstance,
  nextWidgetInstanceSortOrder,
  parseWidgetInstanceParams,
  reorderWidgetInstances,
  restoreWidgetInstance,
  updateWidgetInstanceParams,
} from "@/lib/widgets/widgetInstances";

test("computes sortOrder 0 for the first widget instance", () => {
  expect(nextWidgetInstanceSortOrder([])).toBe(0);
});

test("places a new widget strictly after the highest surviving sortOrder, even with gaps left by a delete", () => {
  // Simulates 3 placed widgets (sortOrder 0, 1, 2) after the middle one was soft-deleted:
  // only rows 0 and 2 remain active, so `.length` (2) would collide with row 2.
  const activeRowsAfterDelete = [{ sortOrder: 0 }, { sortOrder: 2 }];

  expect(nextWidgetInstanceSortOrder(activeRowsAfterDelete)).toBe(3);
});

test("commits a v1.WidgetInstanceCreated event with encoded params", () => {
  const store = { commit: vi.fn() };

  createWidgetInstance({
    store,
    input: {
      id: "inst-1",
      definitionId: "def-1",
      sortOrder: 0,
      params: { folderId: "folder-1" },
    },
  });

  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetInstanceCreated",
    args: {
      id: "inst-1",
      definitionId: "def-1",
      sortOrder: 0,
      params: JSON.stringify({ folderId: "folder-1" }),
    },
  });
  expect(committed?.args.createdAt).toBeInstanceOf(Date);
});

test("defaults params to an empty object when creating an instance", () => {
  const store = { commit: vi.fn() };

  createWidgetInstance({
    store,
    input: { id: "inst-2", definitionId: "def-1", sortOrder: 1 },
  });

  expect(store.commit.mock.calls[0]?.[0]).toMatchObject({
    args: { params: "{}" },
  });
});

test("commits a v1.WidgetInstanceUpdated event with encoded params", () => {
  const store = { commit: vi.fn() };

  updateWidgetInstanceParams({ store, id: "inst-1", params: { folderId: "folder-2" } });

  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetInstanceUpdated",
    args: { id: "inst-1", params: JSON.stringify({ folderId: "folder-2" }) },
  });
  expect(committed?.args.updatedAt).toBeInstanceOf(Date);
});

test("commits a single v1.WidgetInstanceReordered event carrying the whole new order", () => {
  const store = { commit: vi.fn() };

  reorderWidgetInstances({ store, orderedIds: ["inst-3", "inst-1", "inst-2"] });

  expect(store.commit).toHaveBeenCalledTimes(1);
  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetInstanceReordered",
    args: { orderedIds: ["inst-3", "inst-1", "inst-2"] },
  });
  expect(committed?.args.updatedAt).toBeInstanceOf(Date);
});

test("commits a v1.WidgetInstanceDeleted event", () => {
  const store = { commit: vi.fn() };

  deleteWidgetInstance({ store, id: "inst-1" });

  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetInstanceDeleted",
    args: { id: "inst-1" },
  });
  expect(committed?.args.deletedAt).toBeInstanceOf(Date);
});

test("commits a v1.WidgetInstanceRestored event that clears deletedAt", () => {
  const store = { commit: vi.fn() };

  restoreWidgetInstance({ store, id: "inst-1" });

  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetInstanceRestored",
    args: { id: "inst-1" },
  });
  expect(committed?.args.updatedAt).toBeInstanceOf(Date);
});

test("parses stored instance params, falling back to an empty object", () => {
  expect(parseWidgetInstanceParams({ params: JSON.stringify({ folderId: "x" }) })).toEqual({
    folderId: "x",
  });
  expect(parseWidgetInstanceParams({ params: "not json" })).toEqual({});
  expect(parseWidgetInstanceParams({ params: "[1,2,3]" })).toEqual({});
});
