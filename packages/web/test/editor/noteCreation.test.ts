import { beforeEach, expect, test, vi } from "vite-plus/test";

import type { FileMeta } from "@/types/library";
import { createNewMarkdownNote } from "@/lib/editor/noteCreation";
import { saveFileToOpfs } from "@/lib/library/fileStorage";

const testState = vi.hoisted(() => {
  const saveFileToOpfs = vi.fn();

  return {
    saveFileToOpfs,
  };
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

type TestFolder = {
  id: string;
  name: string;
  parentId?: string | null;
};

const createFileMeta = (overrides: Partial<FileMeta> = {}): FileMeta => {
  const id = overrides.id ?? "note-1";

  return {
    id,
    name: overrides.name ?? "Untitled note.md",
    type: overrides.type ?? "document",
    mimeType: overrides.mimeType ?? "text/markdown",
    sizeBytes: overrides.sizeBytes ?? 0,
    storageType: overrides.storageType ?? "opfs",
    storagePath: overrides.storagePath ?? `/files/${id}/${id}.md`,
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
  testState.saveFileToOpfs.mockReset();
});

test("creates a markdown note in root when settings target is missing", async () => {
  const createdMeta = createFileMeta({
    id: "created-root-note",
    name: "Untitled note.md",
    parentId: null,
  });
  testState.saveFileToOpfs.mockResolvedValue({
    id: createdMeta.id,
    meta: createdMeta,
  });

  const result = await createNewMarkdownNote({
    settings: {
      defaultNoteLocationMode: "folder",
      defaultNoteFolderId: "missing-folder",
    },
    files: [],
    folders: [] satisfies TestFolder[],
  });

  expect(saveFileToOpfs).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Untitled note.md",
      type: "document",
      mimeType: "text/markdown",
      parentId: null,
    }),
  );
  expect(result.meta.mimeType).toBe("text/markdown");
  expect(result.meta.parentId).toBeNull();
  expect(result.meta.name).toBe("Untitled note.md");
  expect(result.destination).toEqual({
    requestedParentId: "missing-folder",
    parentId: null,
    fellBackToRoot: true,
    missingFolderId: "missing-folder",
  });
});

test("generates a unique untitled markdown name within the resolved folder", async () => {
  const createdMeta = createFileMeta({
    id: "created-deduped-note",
    name: "Untitled note 3.md",
    parentId: "notes-folder",
  });
  testState.saveFileToOpfs.mockResolvedValue({
    id: createdMeta.id,
    meta: createdMeta,
  });

  const result = await createNewMarkdownNote({
    settings: {
      defaultNoteLocationMode: "folder",
      defaultNoteFolderId: "notes-folder",
    },
    files: [
      createFileMeta({ id: "existing-1", name: "Untitled note.md", parentId: "notes-folder" }),
      createFileMeta({ id: "existing-2", name: "Untitled note 2.md", parentId: "notes-folder" }),
    ],
    folders: [{ id: "notes-folder", name: "Notes", parentId: null }] satisfies TestFolder[],
  });

  expect(saveFileToOpfs).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Untitled note 3.md",
      parentId: "notes-folder",
    }),
  );
  expect(result.meta.name).toBe("Untitled note 3.md");
  expect(result.destination.fellBackToRoot).toBe(false);
  expect(result.createdEvent).toMatchObject({
    id: createdMeta.id,
    name: "Untitled note 3.md",
    parentId: "notes-folder",
    mimeType: "text/markdown",
  });
  expect(result.createdEvent.createdAt).toBeInstanceOf(Date);
});
