import { describe, expect, test } from "vite-plus/test";

import { planSeedDedupe, type SeedDedupeInput } from "@/lib/widgets/dedupeSeededWidgets";

const folder = (id: string, parentId: string | null, reservedKind: string | null, at: number) =>
  ({
    id,
    name: id,
    parentId,
    reservedKind,
    createdAt: new Date(at),
    deletedAt: null,
    purgedAt: null,
  }) as never;
const file = (id: string, name: string, parentId: string) =>
  ({ id, name, parentId, deletedAt: null, purgedAt: null }) as never;

// Device A seeded at t=0 and later added its own widget; device B seeded at t=1000s, before it
// turned on sync, and also built a widget of its own.
const input: SeedDedupeInput = {
  folders: [
    folder("a-root", null, "widgets", 0),
    folder("a-todo", "a-root", "widgetDefinition", 100),
    folder("b-root", null, "widgets", 1_000_000),
    folder("b-todo", "b-root", "widgetDefinition", 1_000_100),
    folder("b-clock", "b-root", "widgetDefinition", 2_000_000),
  ],
  files: [
    file("a-tasks", "Today Tasks", "a-todo"),
    file("b-tasks", "Today Tasks", "b-todo"),
    file("b-manifest", "widget.json", "b-todo"),
  ],
  instances: [
    { id: "a-home", definitionId: "builtin:todo", createdAt: new Date(200), deletedAt: null },
    { id: "b-home", definitionId: "builtin:todo", createdAt: new Date(1_000_200), deletedAt: null },
    {
      id: "b-later",
      definitionId: "builtin:todo",
      createdAt: new Date(3_000_000),
      deletedAt: null,
    },
  ] as never,
  definitions: [{ id: "builtin:todo", kind: "builtin", folderId: "a-todo" }] as never,
};

const summary = (events: ReturnType<typeof planSeedDedupe>) =>
  events.map((event) => `${event.name} ${event.args.id}`);

describe("seeded widget dedupe", () => {
  test("keeps the set the built-in definitions use and trashes the other device's seed", () => {
    expect(summary(planSeedDedupe(input))).toEqual([
      "v1.FileDeleted b-tasks",
      "v1.FileDeleted b-manifest",
      "v1.FolderDeleted b-todo",
      "v1.FolderUpdated b-clock",
      "v1.FolderDeleted b-root",
      "v1.WidgetInstanceDeleted b-home",
    ]);
  });

  test("does nothing with one Widgets folder", () => {
    expect(planSeedDedupe({ ...input, folders: input.folders.slice(0, 2) })).toEqual([]);
  });
});
