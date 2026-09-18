import { expect, test, vi } from "vite-plus/test";

import { saveChatWidgetDefinition } from "@/lib/widgets/saveChatWidgetDefinition";
import { widgetFoldersQuery$ } from "@/lib/widgets/widgetFolders";
import type { SaveFileInput, SaveFileResult } from "@/lib/library/fileStorage";
import type { FileMeta } from "@/types/library";

const testState = vi.hoisted(() => {
  const saveFileToOpfs = vi.fn();
  return { saveFileToOpfs };
});

vi.mock("@/lib/library/fileStorage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/library/fileStorage")>(
    "@/lib/library/fileStorage",
  );

  return {
    ...actual,
    saveFileToOpfs: testState.saveFileToOpfs,
  };
});

const buildMeta = (overrides: Partial<FileMeta> & Pick<FileMeta, "id" | "name">): FileMeta => ({
  type: "document",
  mimeType: "text/html",
  sizeBytes: 10,
  storageType: "opfs",
  storagePath: `/files/${overrides.id}/${overrides.id}`,
  metaPath: `/files/${overrides.id}/${overrides.id}.meta.json`,
  parentId: null,
  positionX: null,
  positionY: null,
  createdAt: 1_000,
  updatedAt: 1_000,
  durationSec: null,
  transcriptPath: null,
  transcriptPreview: null,
  ...overrides,
});

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  reservedKind: "widgets" | "widgetDefinition" | null;
  deletedAt: Date | null;
  purgedAt: Date | null;
}

const makeStore = (folders: FolderRow[] = []) => ({
  commit: vi.fn(),
  query: vi.fn((query: unknown) => (query === widgetFoldersQuery$ ? folders : [])),
});

const stubSaveFileToOpfs = () => {
  let call = 0;
  testState.saveFileToOpfs.mockImplementation(
    async (input: SaveFileInput): Promise<SaveFileResult> => {
      call += 1;
      const id = `${input.name}-id-${call}`;
      return { id, meta: buildMeta({ id, name: input.name, parentId: input.parentId ?? null }) };
    },
  );
};

test("saving a generated widget creates its Widgets folder, widget.html, widget.json, and the definition with references", async () => {
  const store = makeStore([]);
  stubSaveFileToOpfs();

  const result = await saveChatWidgetDefinition({
    store,
    input: {
      id: "widget-definition-1",
      name: "Recent research",
      widgetCode: "<div>Recent research</div>",
      dataSourceName: "recentFiles",
      dataSourceParams: { limit: 3 },
    },
  });

  expect(result).toEqual({ ok: true });

  const commits = store.commit.mock.calls.map((call) => call[0]);

  const rootFolderCreated = commits.find(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgets",
  );
  expect(rootFolderCreated?.args.name).toBe("Widgets");
  expect(rootFolderCreated?.args.parentId).toBeNull();

  const definitionFolderCreated = commits.find(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgetDefinition",
  );
  expect(definitionFolderCreated?.args.name).toBe("Recent research");
  expect(definitionFolderCreated?.args.parentId).toBe(rootFolderCreated?.args.id);

  const fileCreatedEvents = commits.filter((event) => event.name === "v1.FileCreated");
  expect(fileCreatedEvents).toHaveLength(2);
  expect(
    fileCreatedEvents.every((event) => event.args.parentId === definitionFolderCreated?.args.id),
  ).toBe(true);

  expect(testState.saveFileToOpfs).toHaveBeenCalledWith(
    expect.objectContaining({ name: "widget.html", parentId: definitionFolderCreated?.args.id }),
  );
  expect(testState.saveFileToOpfs).toHaveBeenCalledWith(
    expect.objectContaining({ name: "widget.json", parentId: definitionFolderCreated?.args.id }),
  );

  const definitionCreated = commits.find((event) => event.name === "v1.WidgetDefinitionCreated");
  expect(definitionCreated?.args).toMatchObject({
    id: "widget-definition-1",
    kind: "generated",
    name: "Recent research",
    dataSourceName: "recentFiles",
    dataSourceParams: JSON.stringify({ limit: 3 }),
    folderId: definitionFolderCreated?.args.id,
  });
  expect(definitionCreated?.args.sourceFileId).toBeTruthy();
});

test("reuses an existing Widgets root and appends a numeric suffix on a folder name collision", async () => {
  const existingRoot: FolderRow = {
    id: "root-1",
    name: "Widgets",
    parentId: null,
    reservedKind: "widgets",
    deletedAt: null,
    purgedAt: null,
  };
  const existingSibling: FolderRow = {
    id: "sibling-1",
    name: "Recent research",
    parentId: "root-1",
    reservedKind: "widgetDefinition",
    deletedAt: null,
    purgedAt: null,
  };
  const store = makeStore([existingRoot, existingSibling]);
  stubSaveFileToOpfs();

  const result = await saveChatWidgetDefinition({
    store,
    input: {
      id: "widget-definition-2",
      name: "Recent research",
      widgetCode: "<div>Recent research</div>",
      dataSourceName: "recentFiles",
    },
  });

  expect(result).toEqual({ ok: true });

  const commits = store.commit.mock.calls.map((call) => call[0]);
  expect(
    commits.some(
      (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgets",
    ),
  ).toBe(false);

  const definitionFolderCreated = commits.find(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgetDefinition",
  );
  expect(definitionFolderCreated?.args.name).toBe("Recent research 2");
  expect(definitionFolderCreated?.args.parentId).toBe("root-1");
});

test("rejects a chat widget definition without a catalog binding", async () => {
  const store = makeStore([]);

  const result = await saveChatWidgetDefinition({
    store,
    input: {
      id: "widget-definition-1",
      name: "Recent research",
      widgetCode: "<div>Recent research</div>",
    },
  });

  expect(result).toEqual({ ok: false, reason: "missing-data-source" });
  expect(store.commit).not.toHaveBeenCalled();
});

test("rejects a chat widget definition without renderable widget source", async () => {
  const store = makeStore([]);

  const result = await saveChatWidgetDefinition({
    store,
    input: {
      id: "widget-definition-1",
      name: "Recent research",
      widgetCode: "   ",
      dataSourceName: "recentFiles",
    },
  });

  expect(result).toEqual({ ok: false, reason: "missing-widget-code" });
  expect(store.commit).not.toHaveBeenCalled();
});
