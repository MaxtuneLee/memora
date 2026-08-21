import { beforeEach, expect, test, vi } from "vite-plus/test";

import { saveImageAttachment } from "@/lib/editor/imageAttachments";
import type { WorkspaceFolderLike } from "@/lib/editor/logicalPaths";
import type { FileMeta } from "@/types/library";

const fileStorageState = vi.hoisted(() => {
  return {
    saveFileToOpfs: vi.fn(),
  };
});

vi.mock("@/lib/library/fileStorage", () => ({
  saveFileToOpfs: fileStorageState.saveFileToOpfs,
}));

const createFile = (overrides: Partial<FileMeta> = {}): FileMeta => {
  const id = overrides.id ?? "file-1";

  return {
    id,
    name: overrides.name ?? "Untitled.md",
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

const createFolder = (overrides: Partial<WorkspaceFolderLike> = {}): WorkspaceFolderLike => {
  return {
    id: overrides.id ?? "folder-1",
    name: overrides.name ?? "Folder",
    parentId: overrides.parentId ?? null,
  };
};

beforeEach(() => {
  fileStorageState.saveFileToOpfs.mockReset();
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "generated-folder-id"),
  });
});

test("falls back to root when the fixed attachment folder is missing", async () => {
  const currentFile = createFile({
    id: "note-1",
    name: "Draft.md",
    parentId: "notes-folder",
  });
  const folders = [createFolder({ id: "notes-folder", name: "Notes" })];
  const attachment = new File(["png-bytes"], "diagram.png", {
    type: "image/png",
  });

  fileStorageState.saveFileToOpfs.mockResolvedValue({
    id: "image-1",
    meta: createFile({
      id: "image-1",
      name: "diagram.png",
      type: "image",
      mimeType: "image/png",
      sizeBytes: attachment.size,
      parentId: null,
      storagePath: "/files/image-1/image-1.png",
      metaPath: "/files/image-1/image-1.meta.json",
    }),
  });

  const result = await saveImageAttachment({
    currentFile,
    files: [currentFile],
    folders,
    image: attachment,
    settings: {
      attachmentPlacementMode: "fixed-folder",
      attachmentFolderId: "missing-folder",
      attachmentSubfolderName: "images",
    },
  });

  expect(fileStorageState.saveFileToOpfs).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "diagram.png",
      parentId: null,
      type: "image",
      mimeType: "image/png",
    }),
  );
  expect(result.destination).toMatchObject({
    requestedParentId: "missing-folder",
    parentId: null,
    fellBackToRoot: true,
    missingFolderId: "missing-folder",
  });
  expect(result.markdownPath).toBe("../diagram.png");
  expect(result.createdFolderEvent).toBeNull();
});

test("creates the current attachment subfolder on demand and returns folderCreated plus fileCreated events", async () => {
  const currentFile = createFile({
    id: "note-2",
    name: "Draft.md",
    parentId: "notes-folder",
  });
  const folders = [createFolder({ id: "notes-folder", name: "Notes" })];
  const attachment = new File(["png-bytes"], "diagram.png", {
    type: "image/png",
  });

  fileStorageState.saveFileToOpfs.mockResolvedValue({
    id: "image-2",
    meta: createFile({
      id: "image-2",
      name: "diagram.png",
      type: "image",
      mimeType: "image/png",
      sizeBytes: attachment.size,
      parentId: "generated-folder-id",
      storagePath: "/files/image-2/image-2.png",
      metaPath: "/files/image-2/image-2.meta.json",
    }),
  });

  const result = await saveImageAttachment({
    currentFile,
    files: [currentFile],
    folders,
    image: attachment,
    settings: {
      attachmentPlacementMode: "current-subfolder",
      attachmentFolderId: "",
      attachmentSubfolderName: "images",
    },
  });

  expect(result.createdFolderEvent).toMatchObject({
    id: "generated-folder-id",
    name: "images",
    parentId: "notes-folder",
  });
  expect(result.createdFileEvent).toMatchObject({
    id: "image-2",
    name: "diagram.png",
    parentId: "generated-folder-id",
    type: "image",
    mimeType: "image/png",
  });
  expect(result.markdownPath).toBe("./images/diagram.png");
});
