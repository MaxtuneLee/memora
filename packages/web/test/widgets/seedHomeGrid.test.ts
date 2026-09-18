import { expect, test, vi } from "vite-plus/test";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { seedHomeGrid } from "@/lib/widgets/seedHomeGrid";

const makeStore = (settingsValue: Record<string, unknown> | undefined) => {
  return {
    commit: vi.fn(),
    query: vi.fn((query: unknown) => (query === settingsDocumentQuery$ ? settingsValue : undefined)),
  };
};

test("seeds a builtin Definition and Instance for calendar, todo, and recent in order", () => {
  const store = makeStore(undefined);

  seedHomeGrid({ store, legacyVisibility: {} });

  const definitionEvents = store.commit.mock.calls
    .map((call) => call[0])
    .filter((event) => event.name === "v1.WidgetDefinitionCreated");
  expect(definitionEvents).toHaveLength(3);
  expect(definitionEvents.map((event) => event.args.builtinKey)).toEqual([
    "calendar",
    "todo",
    "recent",
  ]);
  expect(definitionEvents.every((event) => event.args.kind === "builtin")).toBe(true);

  const instanceEvents = store.commit.mock.calls
    .map((call) => call[0])
    .filter((event) => event.name === "v1.WidgetInstanceCreated");
  expect(instanceEvents).toHaveLength(3);
  expect(instanceEvents.map((event) => event.args.sortOrder)).toEqual([0, 1, 2]);
  expect(instanceEvents.map((event) => event.args.definitionId)).toEqual(
    definitionEvents.map((event) => event.args.id),
  );
});

test("marks the migration as seeded so it never re-seeds", () => {
  const store = makeStore(undefined);

  seedHomeGrid({ store, legacyVisibility: {} });

  const settingsEvent = store.commit.mock.calls
    .map((call) => call[0])
    .find((event) => event.name === "settingsSet");
  expect(settingsEvent?.args.value).toMatchObject({ homeGridSeeded: true });
});

test("still creates a Definition but skips the Instance for a widget hidden by the legacy toggle", () => {
  const store = makeStore(undefined);

  seedHomeGrid({ store, legacyVisibility: { calendar: false } });

  const definitionEvents = store.commit.mock.calls
    .map((call) => call[0])
    .filter((event) => event.name === "v1.WidgetDefinitionCreated");
  expect(definitionEvents).toHaveLength(3);

  const instanceEvents = store.commit.mock.calls
    .map((call) => call[0])
    .filter((event) => event.name === "v1.WidgetInstanceCreated");
  const calendarDefinitionId = definitionEvents.find(
    (event) => event.args.builtinKey === "calendar",
  )?.args.id;
  expect(instanceEvents).toHaveLength(2);
  expect(instanceEvents.map((event) => event.args.sortOrder)).toEqual([0, 1]);
  expect(
    instanceEvents.some((event) => event.args.definitionId === calendarDefinitionId),
  ).toBe(false);
});

test("does nothing once homeGridSeeded is already true", () => {
  const store = makeStore({ homeGridSeeded: true });

  seedHomeGrid({ store, legacyVisibility: {} });

  expect(store.commit).not.toHaveBeenCalled();
});
