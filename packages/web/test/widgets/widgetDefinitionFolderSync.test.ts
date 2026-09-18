import { expect, test, vi } from "vite-plus/test";

import { syncWidgetDefinitionFolderRename } from "@/lib/widgets/widgetDefinitionFolderSync";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { widgetDefinition } from "@/livestore/widget";

// syncWidgetDefinitionFolderRename fires off a widget.json rewrite (rewriteWidgetManifestFile),
// which writes through @memora/fs — real OPFS isn't available under Node, so this stands in for
// it the same way test/widgets/dataSourceCatalog.test.ts does for reads.
vi.mock("@memora/fs", () => ({ write: vi.fn(async () => {}) }));

interface CommittedEvent {
  name: string;
  args: Record<string, unknown>;
}

test("renaming a Definition folder renames its Definition and rewrites widget.json", () => {
  const definition = {
    id: "def-1",
    kind: "generated",
    builtinKey: null,
    name: "Recent research",
    dataSourceName: "recentFiles",
    dataSourceParams: JSON.stringify({ limit: 5 }),
    folderId: "folder-1",
    deletedAt: null,
  } as widgetDefinition;
  const manifestFile = {
    id: "json-1",
    name: "widget.json",
    parentId: "folder-1",
    storagePath: "/files/json-1/json-1",
  } as LiveStoreFile;

  const commit = vi.fn();
  const store = { commit };

  syncWidgetDefinitionFolderRename({
    store,
    definitions: [definition],
    files: [manifestFile],
    folderId: "folder-1",
    name: "Renamed widget",
  });

  const commits = commit.mock.calls.map((call) => call[0] as CommittedEvent);
  const rename = commits.find((event) => event.name === "v1.WidgetDefinitionUpdated");
  expect(rename?.args).toMatchObject({ id: "def-1", name: "Renamed widget" });
});

test("does nothing when the folder has no matching Definition", () => {
  const commit = vi.fn();
  const store = { commit };

  syncWidgetDefinitionFolderRename({
    store,
    definitions: [],
    files: [],
    folderId: "folder-unrelated",
    name: "New name",
  });

  expect(commit).not.toHaveBeenCalled();
});

test("does nothing when the folder's name did not actually change", () => {
  const definition = {
    id: "def-1",
    kind: "generated",
    builtinKey: null,
    name: "Recent research",
    dataSourceName: "recentFiles",
    dataSourceParams: "{}",
    folderId: "folder-1",
    deletedAt: null,
  } as widgetDefinition;

  const commit = vi.fn();
  const store = { commit };

  syncWidgetDefinitionFolderRename({
    store,
    definitions: [definition],
    files: [],
    folderId: "folder-1",
    name: "Recent research",
  });

  expect(commit).not.toHaveBeenCalled();
});

test("ignores a soft-deleted Definition even if its folderId still matches", () => {
  const definition = {
    id: "def-1",
    kind: "generated",
    builtinKey: null,
    name: "Recent research",
    dataSourceName: "recentFiles",
    dataSourceParams: "{}",
    folderId: "folder-1",
    deletedAt: new Date(),
  } as widgetDefinition;

  const commit = vi.fn();
  const store = { commit };

  syncWidgetDefinitionFolderRename({
    store,
    definitions: [definition],
    files: [],
    folderId: "folder-1",
    name: "New name",
  });

  expect(commit).not.toHaveBeenCalled();
});
