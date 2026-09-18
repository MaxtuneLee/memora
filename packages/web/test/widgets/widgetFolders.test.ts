import { expect, test, vi } from "vite-plus/test";

import {
  createWidgetDefinitionFolder,
  ensureWidgetsRootFolder,
  findWidgetsRootFolder,
} from "@/lib/widgets/widgetFolders";
import type { folder as LiveStoreFolder } from "@/livestore/folder";

test("creates the Widgets root folder once and reuses it afterwards", () => {
  const store = { commit: vi.fn() };

  const first = ensureWidgetsRootFolder({ store, folders: [] });
  expect(first.created).toBe(true);
  expect(first.folder.name).toBe("Widgets");
  expect(first.folder.reservedKind).toBe("widgets");
  expect(store.commit).toHaveBeenCalledTimes(1);

  const second = ensureWidgetsRootFolder({ store, folders: [first.folder] });
  expect(second.created).toBe(false);
  expect(second.folder.id).toBe(first.folder.id);
  expect(store.commit).toHaveBeenCalledTimes(1);
});

test("appends a numeric suffix when a definition folder name collides with a sibling", () => {
  const store = { commit: vi.fn() };
  const root = ensureWidgetsRootFolder({ store, folders: [] }).folder;

  const first = createWidgetDefinitionFolder({
    store,
    folders: [root],
    rootId: root.id,
    name: "Weather",
  });
  expect(first.folder.name).toBe("Weather");

  const second = createWidgetDefinitionFolder({
    store,
    folders: [root, first.folder],
    rootId: root.id,
    name: "Weather",
  });
  expect(second.folder.name).toBe("Weather 2");

  const third = createWidgetDefinitionFolder({
    store,
    folders: [root, first.folder, second.folder],
    rootId: root.id,
    name: "Weather",
  });
  expect(third.folder.name).toBe("Weather 3");
});

test("does not collide with a same-named folder outside Widgets", () => {
  const store = { commit: vi.fn() };
  const root = ensureWidgetsRootFolder({ store, folders: [] }).folder;
  const unrelated: LiveStoreFolder = {
    id: "elsewhere",
    name: "Weather",
    parentId: "some-other-folder",
    reservedKind: null,
    positionX: null,
    positionY: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    purgedAt: null,
  } as LiveStoreFolder;

  const created = createWidgetDefinitionFolder({
    store,
    folders: [root, unrelated],
    rootId: root.id,
    name: "Weather",
  });

  expect(created.folder.name).toBe("Weather");
});

test("findWidgetsRootFolder finds only the reserved root, ignoring definition folders", () => {
  const root: LiveStoreFolder = {
    id: "root-1",
    name: "Widgets",
    parentId: null,
    reservedKind: "widgets",
    positionX: null,
    positionY: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    purgedAt: null,
  } as LiveStoreFolder;
  const definitionFolder: LiveStoreFolder = {
    ...root,
    id: "def-folder-1",
    reservedKind: "widgetDefinition",
  };

  expect(findWidgetsRootFolder([definitionFolder])).toBeNull();
  expect(findWidgetsRootFolder([definitionFolder, root])).toEqual(root);
});
