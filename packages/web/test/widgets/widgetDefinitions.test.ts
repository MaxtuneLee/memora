import { expect, test, vi } from "vite-plus/test";

import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { file as LiveStoreFile } from "@/livestore/file";
import { widgetEvents, type widgetDefinition, type widgetInstance } from "@/livestore/widget";
import {
  createWidgetDefinition,
  deleteWidgetDefinition,
  parseWidgetDefinitionDataSourceParams,
  updateWidgetDefinition,
} from "@/lib/widgets/widgetDefinitions";

// Renaming a Definition that has a folder rewrites widget.json (rewriteWidgetManifestFile),
// which writes through @memora/fs — real OPFS isn't available under Node.
vi.mock("@memora/fs", () => ({ write: vi.fn(async () => {}) }));

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

test("renaming a Definition with a folder also renames the folder and rewrites widget.json", () => {
  const store = { commit: vi.fn() };
  const definition = {
    id: "def-generated",
    kind: "generated",
    builtinKey: null,
    name: "Weather",
    dataSourceName: "recentFiles",
    dataSourceParams: "{}",
    folderId: "folder-1",
    deletedAt: null,
  } as widgetDefinition;
  const manifestFile = {
    id: "json-1",
    name: "widget.json",
    parentId: "folder-1",
    storagePath: "/files/json-1/json-1",
  } as LiveStoreFile;

  updateWidgetDefinition({
    store,
    input: { id: "def-generated", name: "Weather (renamed)" },
    definition,
    files: [manifestFile],
  });

  const commits = store.commit.mock.calls.map((call) => call[0]);
  expect(
    commits.some(
      (event) =>
        event.name === "v1.WidgetDefinitionUpdated" && event.args.name === "Weather (renamed)",
    ),
  ).toBe(true);
  expect(
    commits.some(
      (event) =>
        event.name === "v1.FolderUpdated" &&
        event.args.id === "folder-1" &&
        event.args.name === "Weather (renamed)",
    ),
  ).toBe(true);
});

test("renaming a Definition without a folder only commits the rename", () => {
  const store = { commit: vi.fn() };
  const definition = {
    id: "def-generated",
    kind: "generated",
    builtinKey: null,
    name: "Weather",
    dataSourceName: "recentFiles",
    dataSourceParams: "{}",
    folderId: null,
    deletedAt: null,
  } as widgetDefinition;

  updateWidgetDefinition({
    store,
    input: { id: "def-generated", name: "Weather (renamed)" },
    definition,
  });

  const commits = store.commit.mock.calls.map((call) => call[0]);
  expect(commits).toHaveLength(1);
  expect(commits[0]).toMatchObject({ name: "v1.WidgetDefinitionUpdated" });
});

test("backfills folderId and sourceFileId without touching the folder", () => {
  const store = { commit: vi.fn() };

  updateWidgetDefinition({
    store,
    input: { id: "def-generated", folderId: "folder-1", sourceFileId: "html-1" },
  });

  const commits = store.commit.mock.calls.map((call) => call[0]);
  expect(commits).toHaveLength(1);
  expect(commits[0]).toMatchObject({
    name: "v1.WidgetDefinitionUpdated",
    args: { id: "def-generated", folderId: "folder-1", sourceFileId: "html-1" },
  });
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

test("cascades a Definition's delete to its Instances, folder, and the folder's files", () => {
  const store = { commit: vi.fn() };
  const folders = [
    { id: "folder-1", name: "Recent research", parentId: "widgets-root" },
    { id: "widgets-root", name: "Widgets", parentId: null },
  ] as LiveStoreFolder[];
  const files = [
    { id: "html-1", parentId: "folder-1" },
    { id: "json-1", parentId: "folder-1" },
    { id: "unrelated", parentId: "widgets-root" },
  ] as LiveStoreFile[];
  const instances = [
    { id: "inst-1", definitionId: "def-generated", deletedAt: null },
    { id: "inst-other", definitionId: "some-other-def", deletedAt: null },
  ] as widgetInstance[];

  deleteWidgetDefinition({
    store,
    id: "def-generated",
    folderId: "folder-1",
    folders,
    files,
    instances,
  });

  const commits = store.commit.mock.calls.map((call) => call[0]);
  expect(
    commits.some(
      (event) => event.name === "v1.WidgetDefinitionDeleted" && event.args.id === "def-generated",
    ),
  ).toBe(true);
  expect(
    commits.some(
      (event) => event.name === "v1.WidgetInstanceDeleted" && event.args.id === "inst-1",
    ),
  ).toBe(true);
  expect(
    commits.some(
      (event) => event.name === "v1.WidgetInstanceDeleted" && event.args.id === "inst-other",
    ),
  ).toBe(false);
  expect(
    commits.some((event) => event.name === "v1.FolderDeleted" && event.args.id === "folder-1"),
  ).toBe(true);
  expect(
    commits.some((event) => event.name === "v1.FolderDeleted" && event.args.id === "widgets-root"),
  ).toBe(false);
  const deletedFileIds = commits
    .filter((event) => event.name === "v1.FileDeleted")
    .map((event) => String(event.args.id));
  expect(deletedFileIds.sort((left, right) => left.localeCompare(right))).toEqual([
    "html-1",
    "json-1",
  ]);
});

test("parses stored data source params, falling back to an empty object", () => {
  expect(
    parseWidgetDefinitionDataSourceParams({ dataSourceParams: JSON.stringify({ limit: 3 }) }),
  ).toEqual({ limit: 3 });
  expect(parseWidgetDefinitionDataSourceParams({ dataSourceParams: "not json" })).toEqual({});
  expect(parseWidgetDefinitionDataSourceParams({ dataSourceParams: "42" })).toEqual({});
});
