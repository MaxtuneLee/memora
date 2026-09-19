import { beforeEach, expect, test, vi } from "vite-plus/test";

import { activeFilesQuery$ } from "@/lib/library/queries";
import type { SaveFileInput, SaveFileResult } from "@/lib/library/fileStorage";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { FileMeta } from "@/types/library";

const testState = vi.hoisted(() => {
  const fileTextByPath = new Map<string, string>();
  const file = vi.fn((path: string) => ({
    path,
    text: vi.fn(async () => {
      const text = fileTextByPath.get(path);
      if (text === undefined) {
        throw new Error(`Missing file content for ${path}`);
      }
      return text;
    }),
  }));
  const write = vi.fn(async () => {});
  const saveFileToOpfs = vi.fn();
  return { fileTextByPath, file, write, saveFileToOpfs };
});

vi.mock("@memora/fs", () => ({ file: testState.file, write: testState.write }));
vi.mock("@/lib/library/fileStorage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/library/fileStorage")>(
    "@/lib/library/fileStorage",
  );
  return { ...actual, saveFileToOpfs: testState.saveFileToOpfs };
});

import {
  WIDGET_DATA_MAX_FILE_BYTES,
  WIDGET_DATA_MAX_TOTAL_BYTES,
  validateWidgetDataWrite,
  writeWidgetDataFile,
} from "@/lib/widgets/widgetDataFile";
import { widgetFoldersQuery$ } from "@/lib/widgets/widgetFolders";

beforeEach(() => {
  testState.fileTextByPath.clear();
  testState.file.mockClear();
  testState.write.mockClear();
  testState.saveFileToOpfs.mockReset();
});

// --- validateWidgetDataWrite (pure) ---

test("refuses a write with no declared file names at all", () => {
  const result = validateWidgetDataWrite({
    name: "state.json",
    content: "{}",
    allowedNames: null,
    existingSizesByName: {},
  });

  expect(result).toEqual({ ok: false, error: expect.stringContaining("not a declared data file") });
});

test("refuses a write to a name outside the declared list", () => {
  const result = validateWidgetDataWrite({
    name: "secrets.json",
    content: "{}",
    allowedNames: ["state.json"],
    existingSizesByName: {},
  });

  expect(result.ok).toBe(false);
});

test("refuses a write over the per-file byte limit", () => {
  const result = validateWidgetDataWrite({
    name: "state.json",
    content: "x".repeat(WIDGET_DATA_MAX_FILE_BYTES + 1),
    allowedNames: ["state.json"],
    existingSizesByName: {},
  });

  expect(result).toEqual({ ok: false, error: expect.stringContaining("byte limit") });
});

test("refuses a write that would push the definition's total past the storage cap", () => {
  const result = validateWidgetDataWrite({
    name: "b.json",
    content: "x".repeat(1_000),
    allowedNames: ["a.json", "b.json"],
    existingSizesByName: { "a.json": WIDGET_DATA_MAX_TOTAL_BYTES - 500 },
  });

  expect(result).toEqual({ ok: false, error: expect.stringContaining("storage limit") });
});

test("excludes the file's own prior size from the total cap, so overwriting it is not double-counted", () => {
  const result = validateWidgetDataWrite({
    name: "a.json",
    content: "x".repeat(1_000),
    allowedNames: ["a.json"],
    existingSizesByName: { "a.json": WIDGET_DATA_MAX_TOTAL_BYTES - 500 },
  });

  expect(result.ok).toBe(true);
});

test("accepts a declared, in-budget write", () => {
  const result = validateWidgetDataWrite({
    name: "state.json",
    content: '{"streak":3}',
    allowedNames: ["state.json"],
    existingSizesByName: {},
  });

  expect(result).toEqual({ ok: true, byteLength: 12 });
});

// --- writeWidgetDataFile (host-side, OPFS + LiveStore) ---

const buildManifestFile = (folderId: string, id = "manifest-1"): LiveStoreFile =>
  ({
    id,
    name: "widget.json",
    parentId: folderId,
    storagePath: `/files/${id}/${id}.json`,
    deletedAt: null,
  }) as LiveStoreFile;

const buildDataFile = (overrides: Partial<LiveStoreFile> & { id: string }): LiveStoreFile =>
  ({
    name: "state.json",
    parentId: "data-folder-1",
    storagePath: `/files/${overrides.id}/${overrides.id}`,
    sizeBytes: 10,
    mimeType: "application/json",
    type: "document",
    storageType: "opfs",
    positionX: null,
    positionY: null,
    createdAt: new Date(1_000),
    updatedAt: new Date(1_000),
    deletedAt: null,
    ...overrides,
  }) as LiveStoreFile;

// A live store backed by mutable arrays: commit() mutates them in place, so a write queued
// behind an earlier one for the same store sees that earlier write's folder/file, exactly like
// LiveStore's synchronous local commit-then-query behavior.
const makeLiveStore = (
  initialFolders: LiveStoreFolder[] = [],
  initialFiles: LiveStoreFile[] = [],
) => {
  const folders = [...initialFolders];
  const files = [...initialFiles];
  const commit = vi.fn((...events: unknown[]) => {
    const event = events[0] as { name: string; args: Record<string, unknown> };
    if (event.name === "v1.FolderCreated") {
      folders.push({
        id: event.args.id,
        name: event.args.name,
        parentId: event.args.parentId,
        deletedAt: null,
      } as LiveStoreFolder);
    } else if (event.name === "v1.FileCreated") {
      files.push({
        id: event.args.id,
        name: event.args.name,
        parentId: event.args.parentId,
        sizeBytes: event.args.sizeBytes,
        deletedAt: null,
      } as LiveStoreFile);
    } else if (event.name === "v1.FileUpdated") {
      const target = files.find((file) => file.id === event.args.id);
      if (target) {
        Object.assign(target, { sizeBytes: event.args.sizeBytes });
      }
    }
  });
  const query = vi.fn((q: unknown) => {
    if (q === widgetFoldersQuery$) return folders;
    if (q === activeFilesQuery$) return files;
    return [];
  });
  return { commit, query, folders, files };
};

type CommittedEvent = { name: string; args: Record<string, string | number | null | undefined> };

const getCommits = (store: { commit: { mock: { calls: unknown[][] } } }): CommittedEvent[] =>
  store.commit.mock.calls.map((call) => call[0] as CommittedEvent);

const stubSaveFileToOpfs = () => {
  let counter = 0;
  testState.saveFileToOpfs.mockImplementation(
    async (input: SaveFileInput): Promise<SaveFileResult> => {
      counter += 1;
      const id = `${input.name}-new-id-${counter}`;
      const meta: FileMeta = {
        id,
        name: input.name,
        type: "document",
        mimeType: input.mimeType ?? "text/plain",
        sizeBytes: input.blob.size,
        storageType: "opfs",
        storagePath: `/files/${id}/${id}`,
        metaPath: `/files/${id}/${id}.meta.json`,
        parentId: input.parentId ?? null,
        positionX: null,
        positionY: null,
        createdAt: 1_000,
        updatedAt: 1_000,
        durationSec: null,
        transcriptPath: null,
        transcriptPreview: null,
      };
      return { id, meta };
    },
  );
};

test("refuses a write when the definition has no widget.json at all", async () => {
  const store = makeLiveStore();

  const result = await writeWidgetDataFile({
    store,
    definitionFolderId: "def-folder-1",
    name: "state.json",
    content: "{}",
  });

  expect(result).toEqual({ ok: false, error: expect.stringContaining("not a declared data file") });
  expect(store.commit).not.toHaveBeenCalled();
});

test("refuses a write to a name the manifest didn't declare", async () => {
  const manifestFile = buildManifestFile("def-folder-1");
  testState.fileTextByPath.set(
    manifestFile.storagePath,
    JSON.stringify({ dataFiles: ["state.json"] }),
  );
  const store = makeLiveStore([], [manifestFile]);

  const result = await writeWidgetDataFile({
    store,
    definitionFolderId: "def-folder-1",
    name: "other.json",
    content: "{}",
  });

  expect(result.ok).toBe(false);
  expect(store.commit).not.toHaveBeenCalled();
});

test("creates the data folder and file on first write to a declared name", async () => {
  const manifestFile = buildManifestFile("def-folder-1");
  testState.fileTextByPath.set(
    manifestFile.storagePath,
    JSON.stringify({ dataFiles: ["state.json"] }),
  );
  const store = makeLiveStore([], [manifestFile]);
  stubSaveFileToOpfs();

  const result = await writeWidgetDataFile({
    store,
    definitionFolderId: "def-folder-1",
    name: "state.json",
    content: '{"streak":1}',
  });

  expect(result).toEqual({ ok: true });
  const commits = getCommits(store);
  const folderCreated = commits.find((event) => event.name === "v1.FolderCreated");
  expect(folderCreated?.args).toMatchObject({ name: "data", parentId: "def-folder-1" });
  const fileCreated = commits.find((event) => event.name === "v1.FileCreated");
  expect(fileCreated?.args).toMatchObject({ name: "state.json", parentId: folderCreated?.args.id });
});

test("reuses an existing data folder instead of creating a second one", async () => {
  const manifestFile = buildManifestFile("def-folder-1");
  testState.fileTextByPath.set(
    manifestFile.storagePath,
    JSON.stringify({ dataFiles: ["state.json"] }),
  );
  const dataFolder = {
    id: "data-folder-1",
    name: "data",
    parentId: "def-folder-1",
    deletedAt: null,
  } as LiveStoreFolder;
  const store = makeLiveStore([dataFolder], [manifestFile]);
  stubSaveFileToOpfs();

  await writeWidgetDataFile({
    store,
    definitionFolderId: "def-folder-1",
    name: "state.json",
    content: '{"streak":1}',
  });

  const commits = getCommits(store);
  expect(commits.some((event) => event.name === "v1.FolderCreated")).toBe(false);
  expect(testState.saveFileToOpfs).toHaveBeenCalledWith(
    expect.objectContaining({ parentId: "data-folder-1" }),
  );
});

test("overwrites an existing data file in place instead of creating a duplicate", async () => {
  const manifestFile = buildManifestFile("def-folder-1");
  testState.fileTextByPath.set(
    manifestFile.storagePath,
    JSON.stringify({ dataFiles: ["state.json"] }),
  );
  const dataFolder = {
    id: "data-folder-1",
    name: "data",
    parentId: "def-folder-1",
    deletedAt: null,
  } as LiveStoreFolder;
  const existingDataFile = buildDataFile({ id: "state-file-1" });
  const store = makeLiveStore([dataFolder], [manifestFile, existingDataFile]);

  const result = await writeWidgetDataFile({
    store,
    definitionFolderId: "def-folder-1",
    name: "state.json",
    content: '{"streak":2}',
  });

  expect(result).toEqual({ ok: true });
  expect(testState.saveFileToOpfs).not.toHaveBeenCalled();
  const commits = getCommits(store);
  expect(
    commits.some((event) => event.name === "v1.FileUpdated" && event.args.id === "state-file-1"),
  ).toBe(true);
});

test("keeps two definitions' data completely isolated: writing to one never touches the other's folder or files", async () => {
  const manifestA = buildManifestFile("def-folder-A", "manifest-a");
  testState.fileTextByPath.set(manifestA.storagePath, JSON.stringify({ dataFiles: ["a.json"] }));
  const storeA = makeLiveStore([], [manifestA]);

  const manifestB = buildManifestFile("def-folder-B", "manifest-b");
  testState.fileTextByPath.set(manifestB.storagePath, JSON.stringify({ dataFiles: ["b.json"] }));
  const storeB = makeLiveStore([], [manifestB]);
  stubSaveFileToOpfs();

  await writeWidgetDataFile({
    store: storeA,
    definitionFolderId: "def-folder-A",
    name: "a.json",
    content: "{}",
  });

  // A widget bound to Definition B cannot reach Definition A's name at all — the write handler
  // only ever sees B's own manifest/files, mirroring how each GeneratedWidgetTile's onWriteData
  // closure is bound to exactly one folderId.
  const crossAttempt = await writeWidgetDataFile({
    store: storeB,
    definitionFolderId: "def-folder-B",
    name: "a.json",
    content: "{}",
  });

  expect(crossAttempt.ok).toBe(false);
  const bFolderCreated = getCommits(storeB).find((event) => event.name === "v1.FolderCreated");
  expect(bFolderCreated).toBeUndefined();
});

test("serializes two concurrent writes for different names on the same definition into a single data folder", async () => {
  // Regression test: coalescing in the Home Grid shim is per file name (see
  // generatedWidgetRuntime.ts), so two different names can reach the host in the same tick.
  // Without serializing by definitionFolderId, both would query folders/files before either
  // committed, each conclude the data/ folder doesn't exist, and each create one — splitting the
  // definition's files across two folders (see ADR 0008).
  const manifestFile = buildManifestFile("def-folder-1");
  testState.fileTextByPath.set(
    manifestFile.storagePath,
    JSON.stringify({ dataFiles: ["a.json", "b.json"] }),
  );
  const store = makeLiveStore([], [manifestFile]);
  stubSaveFileToOpfs();

  const [resultA, resultB] = await Promise.all([
    writeWidgetDataFile({
      store,
      definitionFolderId: "def-folder-1",
      name: "a.json",
      content: "1",
    }),
    writeWidgetDataFile({
      store,
      definitionFolderId: "def-folder-1",
      name: "b.json",
      content: "2",
    }),
  ]);

  expect(resultA).toEqual({ ok: true });
  expect(resultB).toEqual({ ok: true });
  const folderCreatedEvents = getCommits(store).filter(
    (event) => event.name === "v1.FolderCreated",
  );
  expect(folderCreatedEvents).toHaveLength(1);
  expect(
    store.files.filter((file) => file.parentId === folderCreatedEvents[0]?.args.id),
  ).toHaveLength(2);
});
