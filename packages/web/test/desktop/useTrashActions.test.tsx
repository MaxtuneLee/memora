import { act, cleanup, renderHook } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { useTrashActions } from "@/hooks/desktop/useTrashActions";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { DesktopFolderItem } from "@/types/desktop";

vi.mock("@/lib/content/contentPipelineRoot", () => ({
  useContentPipeline: () => ({ purgeFile: vi.fn(async () => {}) }),
}));

const setupDom = () => {
  // This file has no environmentMatchGlobs entry (unlike test/editor/**), so it runs under the
  // default "node" test environment with no ambient `document` — set up jsdom before cleanup()
  // touches it.
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
};

beforeEach(() => {
  setupDom();
  cleanup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface CommittedEvent {
  name: string;
  args: Record<string, unknown>;
}

const buildFolder = (overrides: Partial<LiveStoreFolder> & { id: string }): LiveStoreFolder =>
  ({
    name: "Untitled",
    parentId: null,
    reservedKind: null,
    positionX: null,
    positionY: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    purgedAt: null,
    ...overrides,
  }) as LiveStoreFolder;

const buildFile = (overrides: Partial<LiveStoreFile> & { id: string }): LiveStoreFile =>
  ({
    name: "widget.json",
    type: "document",
    mimeType: "application/json",
    sizeBytes: 2,
    storageType: "opfs",
    storagePath: `/files/${overrides.id}/${overrides.id}`,
    parentId: null,
    positionX: null,
    positionY: null,
    transcriptPath: null,
    indexedAt: null,
    indexStatus: "pending",
    indexSummary: null,
    collectionId: null,
    durationSec: null,
    thumbnailPath: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    purgedAt: null,
    ...overrides,
  }) as LiveStoreFile;

test("trashing a Widget Definition folder cascades to its Definition and Instances", async () => {
  const rootFolder = buildFolder({ id: "widgets-root", name: "Widgets", reservedKind: "widgets" });
  const definitionFolder = buildFolder({
    id: "folder-1",
    name: "Recent research",
    parentId: "widgets-root",
    reservedKind: "widgetDefinition",
  });
  const manifestFile = buildFile({ id: "json-1", parentId: "folder-1" });
  const definition = { id: "def-1", folderId: "folder-1", deletedAt: null } as widgetDefinition;
  const otherDefinition = {
    id: "def-other",
    folderId: "folder-2",
    deletedAt: null,
  } as widgetDefinition;
  const instance = {
    id: "inst-1",
    definitionId: "def-1",
    deletedAt: null,
  } as widgetInstance;
  const otherInstance = {
    id: "inst-other",
    definitionId: "def-other",
    deletedAt: null,
  } as widgetInstance;

  const commit = vi.fn();
  const item: DesktopFolderItem = {
    id: "folder-1",
    name: "Recent research",
    type: "folder",
    position: { x: 0, y: 0 },
    parentId: "widgets-root",
    hasStoredPosition: false,
    reservedKind: "widgetDefinition",
  };

  const { result } = renderHook(() =>
    useTrashActions({
      store: { commit },
      allFileRows: [manifestFile],
      allFolderRows: [rootFolder, definitionFolder],
      widgetDefinitions: [definition, otherDefinition],
      widgetInstances: [instance, otherInstance],
      trashedFileItems: [],
      trashedFolderItems: [],
      mapToMeta: () => {
        throw new Error("not needed for this test");
      },
      onDeleteFile: vi.fn(async () => {}),
      removeItem: vi.fn(),
    }),
  );

  act(() => {
    result.current.requestTrash(item);
  });

  await act(async () => {
    await result.current.confirm();
  });

  const commits = commit.mock.calls.map((call) => call[0] as CommittedEvent);

  expect(
    commits.some((event) => event.name === "v1.FolderDeleted" && event.args.id === "folder-1"),
  ).toBe(true);
  expect(
    commits.some((event) => event.name === "v1.FileDeleted" && event.args.id === "json-1"),
  ).toBe(true);
  expect(
    commits.some(
      (event) => event.name === "v1.WidgetDefinitionDeleted" && event.args.id === "def-1",
    ),
  ).toBe(true);
  expect(
    commits.some(
      (event) => event.name === "v1.WidgetInstanceDeleted" && event.args.id === "inst-1",
    ),
  ).toBe(true);

  // Only the trashed folder's own Definition is touched — a different Definition/Instance pair
  // elsewhere must be left alone.
  expect(
    commits.some(
      (event) => event.name === "v1.WidgetDefinitionDeleted" && event.args.id === "def-other",
    ),
  ).toBe(false);
  expect(
    commits.some(
      (event) => event.name === "v1.WidgetInstanceDeleted" && event.args.id === "inst-other",
    ),
  ).toBe(false);
});

test("trashing a plain folder does not touch any Widget Definition", async () => {
  const plainFolder = buildFolder({ id: "folder-plain", name: "Notes" });
  const definition = { id: "def-1", folderId: "folder-1", deletedAt: null } as widgetDefinition;

  const commit = vi.fn();
  const item: DesktopFolderItem = {
    id: "folder-plain",
    name: "Notes",
    type: "folder",
    position: { x: 0, y: 0 },
    parentId: null,
    hasStoredPosition: false,
    reservedKind: null,
  };

  const { result } = renderHook(() =>
    useTrashActions({
      store: { commit },
      allFileRows: [],
      allFolderRows: [plainFolder],
      widgetDefinitions: [definition],
      widgetInstances: [],
      trashedFileItems: [],
      trashedFolderItems: [],
      mapToMeta: () => {
        throw new Error("not needed for this test");
      },
      onDeleteFile: vi.fn(async () => {}),
      removeItem: vi.fn(),
    }),
  );

  act(() => {
    result.current.requestTrash(item);
  });

  await act(async () => {
    await result.current.confirm();
  });

  const commits = commit.mock.calls.map((call) => call[0] as CommittedEvent);
  expect(commits.some((event) => event.name === "v1.FolderDeleted")).toBe(true);
  expect(commits.some((event) => event.name.startsWith("v1.WidgetDefinition"))).toBe(false);
});
