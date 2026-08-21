import { beforeEach, expect, test, vi } from "vite-plus/test";

import { file as opfsFile, write as opfsWrite } from "@memora/fs";

import type { FileMeta } from "@/types/library";
import {
  readTextDocumentBytes,
  saveTextDocument,
  upgradeTextFileToMarkdown,
} from "@/lib/editor/documentPersistence";

const testState = vi.hoisted(() => {
  const arrayBufferByPath = new Map<string, ArrayBuffer>();
  const file = vi.fn((path: string) => ({
    path,
    arrayBuffer: vi.fn(async () => {
      const data = arrayBufferByPath.get(path);
      if (!data) {
        throw new Error(`Missing file content for ${path}`);
      }
      return data;
    }),
  }));
  const write = vi.fn(async () => undefined);

  return {
    arrayBufferByPath,
    file,
    write,
  };
});

vi.mock("@memora/fs", () => ({
  file: testState.file,
  write: testState.write,
}));

const createFileMeta = (overrides: Partial<FileMeta> = {}): FileMeta => {
  const id = overrides.id ?? "document-1";

  return {
    id,
    name: overrides.name ?? "Draft.txt",
    type: overrides.type ?? "document",
    mimeType: overrides.mimeType ?? "text/plain",
    sizeBytes: overrides.sizeBytes ?? 0,
    storageType: overrides.storageType ?? "opfs",
    storagePath: overrides.storagePath ?? `/files/${id}/${id}.txt`,
    metaPath: overrides.metaPath ?? `/files/${id}/${id}.meta.json`,
    parentId: overrides.parentId ?? null,
    positionX: overrides.positionX ?? null,
    positionY: overrides.positionY ?? null,
    createdAt: overrides.createdAt ?? 1_746_000_000_000,
    updatedAt: overrides.updatedAt ?? 1_746_000_000_000,
    durationSec: overrides.durationSec ?? null,
    transcriptPath: overrides.transcriptPath ?? null,
    transcriptPreview: overrides.transcriptPreview ?? null,
  };
};

beforeEach(() => {
  testState.arrayBufferByPath.clear();
  testState.file.mockClear();
  testState.write.mockReset();
});

test("reads current text document bytes from opfs", async () => {
  const file = createFileMeta();
  const bytes = new TextEncoder().encode("hello");
  testState.arrayBufferByPath.set(file.storagePath, bytes.buffer.slice(0));

  const result = await readTextDocumentBytes(file);

  expect(opfsFile).toHaveBeenCalledWith(file.storagePath);
  expect(Array.from(result)).toEqual(Array.from(bytes));
});

test("upgrades txt metadata to markdown without requiring storagePath rewrite", async () => {
  const file = createFileMeta({
    id: "draft-file",
    name: "Draft.txt",
    mimeType: "text/plain",
    storagePath: "/files/draft-file/draft-file.txt",
  });

  const result = await upgradeTextFileToMarkdown({
    file,
    text: "# Draft",
    files: [file],
  });

  expect(opfsWrite).toHaveBeenNthCalledWith(1, file.storagePath, expect.any(Uint8Array), {
    overwrite: true,
  });
  expect(result.file.name).toBe("Draft.md");
  expect(result.file.mimeType).toBe("text/markdown");
  expect(result.file.storagePath).toBe(file.storagePath);
  expect(result.updatedEvent).toMatchObject({
    id: file.id,
    name: "Draft.md",
    mimeType: "text/markdown",
    storagePath: file.storagePath,
  });
  expect(result.updatedEvent.updatedAt).toBeInstanceOf(Date);
});

test("backfills editable text names in metadata without rewriting storage", async () => {
  const file = createFileMeta({
    id: "draft-markdown-file",
    name: "Draft",
    mimeType: "text/markdown",
    storagePath: "/files/draft-markdown-file/draft-markdown-file.md",
  });

  const result = await saveTextDocument({
    file,
    text: "# Draft",
  });

  expect(opfsWrite).toHaveBeenNthCalledWith(1, file.storagePath, expect.any(Uint8Array), {
    overwrite: true,
  });
  expect(result.file.name).toBe("Draft.md");
  expect(result.file.storagePath).toBe(file.storagePath);
  expect(result.file.metaPath).toBe(file.metaPath);
  expect(result.updatedEvent.name).toBe("Draft.md");
});

test("save helper surfaces the underlying write error", async () => {
  const file = createFileMeta();
  testState.write.mockRejectedValueOnce(new Error("disk full"));

  await expect(
    saveTextDocument({
      file,
      text: "draft",
    }),
  ).rejects.toThrow("disk full");
});
