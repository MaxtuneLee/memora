import { beforeEach, expect, test, vi } from "vite-plus/test";

import { fileEvents } from "@/livestore/file";
import type { FileMeta } from "@/types/library";
import {
  TODO_DOCUMENT_NAME,
  serializeTodoMarkdown,
  type TodoTask,
} from "@/components/dashboard/todoMarkdown";
import { ensureTodoDocument, saveTodoDocument } from "@/components/dashboard/todoDocument";
import { saveFileToOpfs } from "@/lib/library/fileStorage";

const testState = vi.hoisted(() => {
  const fileTextByPath = new Map<string, string>();
  const write = vi.fn(async (path: string, data: string) => {
    fileTextByPath.set(path, data);
  });
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
  const saveFileToOpfs = vi.fn();

  return {
    file,
    fileTextByPath,
    saveFileToOpfs,
    write,
  };
});

vi.mock("@memora/fs", () => ({
  file: testState.file,
  write: testState.write,
}));

vi.mock("@/lib/library/fileStorage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/library/fileStorage")>(
    "@/lib/library/fileStorage",
  );

  return {
    ...actual,
    saveFileToOpfs: testState.saveFileToOpfs,
  };
});

const createFileMeta = (overrides: Partial<FileMeta> = {}): FileMeta => {
  const id = overrides.id ?? "todo-file";

  return {
    id,
    name: TODO_DOCUMENT_NAME,
    type: "document",
    mimeType: "text/markdown",
    sizeBytes: 32,
    storageType: "opfs",
    storagePath: `/files/${id}/${id}.md`,
    metaPath: `/files/${id}/${id}.meta.json`,
    parentId: null,
    positionX: null,
    positionY: null,
    createdAt: 1_742_960_000_000,
    updatedAt: 1_742_960_000_000,
    durationSec: null,
    transcriptPath: null,
    transcriptPreview: null,
    ...overrides,
  };
};

beforeEach(() => {
  testState.fileTextByPath.clear();
  testState.file.mockClear();
  testState.write.mockClear();
  testState.saveFileToOpfs.mockReset();
});

test("creates the backing todo markdown document when it does not exist", async () => {
  const createdMeta = createFileMeta({
    id: "created-todo",
    storagePath: "/files/created-todo/created-todo.md",
    metaPath: "/files/created-todo/created-todo.meta.json",
  });
  testState.saveFileToOpfs.mockResolvedValue({
    id: createdMeta.id,
    meta: createdMeta,
  });
  const store = {
    commit: vi.fn(),
  };

  const result = await ensureTodoDocument({
    files: [],
    store,
  });

  expect(saveFileToOpfs).toHaveBeenCalledWith(
    expect.objectContaining({
      name: TODO_DOCUMENT_NAME,
      type: "document",
      mimeType: "text/markdown",
    }),
  );
  expect(result.file).toEqual(createdMeta);
  expect(result.tasks).toEqual([]);
  expect(store.commit).toHaveBeenCalledTimes(1);
  expect(store.commit).toHaveBeenCalledWith(
    fileEvents.fileCreated({
      id: createdMeta.id,
      name: createdMeta.name,
      type: createdMeta.type,
      mimeType: createdMeta.mimeType,
      sizeBytes: createdMeta.sizeBytes,
      storageType: createdMeta.storageType,
      storagePath: createdMeta.storagePath,
      parentId: createdMeta.parentId ?? null,
      positionX: createdMeta.positionX ?? null,
      positionY: createdMeta.positionY ?? null,
      createdAt: new Date(createdMeta.createdAt),
    }),
  );
});

test("reuses the most recently updated active todo file when one already exists", async () => {
  const older = createFileMeta({
    id: "older",
    updatedAt: 10,
  });
  const latest = createFileMeta({
    id: "latest",
    updatedAt: 20,
    storagePath: "/files/latest/latest.md",
  });
  testState.fileTextByPath.set(
    latest.storagePath,
    serializeTodoMarkdown([
      {
        id: "open-0-storage",
        text: "Draft the parser",
        done: false,
      },
    ]),
  );
  const store = {
    commit: vi.fn(),
  };

  const result = await ensureTodoDocument({
    files: [older, latest],
    store,
  });

  expect(testState.saveFileToOpfs).not.toHaveBeenCalled();
  expect(result.file.id).toBe(latest.id);
  expect(result.tasks).toHaveLength(1);
  expect(result.tasks[0]).toMatchObject({
    text: "Draft the parser",
    done: false,
  });
  expect(store.commit).not.toHaveBeenCalled();
});

test("writes updated markdown content and metadata when saving tasks", async () => {
  const existing = createFileMeta({
    sizeBytes: 12,
    updatedAt: 100,
  });
  const tasks: TodoTask[] = [
    {
      id: "open-0-storage",
      text: "Draft the storage parser\nwith a second line",
      done: false,
    },
    {
      id: "done-1-ui",
      text: "Replace the static dashboard card",
      done: true,
    },
  ];
  const store = {
    commit: vi.fn(),
  };

  const result = await saveTodoDocument({
    file: existing,
    store,
    tasks,
  });

  const markdown = serializeTodoMarkdown(tasks);
  expect(testState.write).toHaveBeenCalledTimes(2);
  expect(testState.write).toHaveBeenNthCalledWith(1, existing.storagePath, markdown, {
    overwrite: true,
  });
  expect(testState.write.mock.calls[1]?.[0]).toBe(existing.metaPath);

  const savedMeta = JSON.parse(String(testState.write.mock.calls[1]?.[1] ?? "")) as FileMeta;

  expect(savedMeta.name).toBe(existing.name);
  expect(savedMeta.sizeBytes).toBe(new Blob([markdown]).size);
  expect(savedMeta.updatedAt).toBeGreaterThan(existing.updatedAt);
  expect(result.tasks).toEqual(tasks);
  expect(result.file.sizeBytes).toBe(savedMeta.sizeBytes);
  expect(store.commit).toHaveBeenCalledTimes(1);
  expect(store.commit.mock.calls[0]?.[0]).toMatchObject({
    name: "v1.FileUpdated",
    args: {
      id: existing.id,
      name: existing.name,
      mimeType: existing.mimeType,
      sizeBytes: savedMeta.sizeBytes,
      storageType: existing.storageType,
      storagePath: existing.storagePath,
    },
  });
  expect(store.commit.mock.calls[0]?.[0]?.args.updatedAt).toBeInstanceOf(Date);
});
