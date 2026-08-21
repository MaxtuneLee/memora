import { expect, test } from "vite-plus/test";

import {
  moveFolderWithPathPolicy,
  normalizePathAddressableUploadName,
  renamePathAddressableFile,
} from "@/lib/editor/pathMutations";
import type { FileMeta, FileType } from "@/types/library";
import type { WorkspaceFolderLike } from "@/lib/editor/logicalPaths";

const createFile = (
  overrides: Partial<FileMeta> & { type?: FileType } = {},
): FileMeta & { parentId: string | null } => {
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
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
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

test("rejects renaming a path-addressable document to a duplicate sibling name", () => {
  const files = [
    createFile({ id: "note-a", name: "alpha.md", parentId: "docs" }),
    createFile({ id: "note-b", name: "beta.md", parentId: "docs" }),
  ];

  expect(() =>
    renamePathAddressableFile(files, {
      id: "note-b",
      name: "alpha.md",
      parentId: "docs",
      type: "document",
    }),
  ).toThrow(/already exists/i);
});

test("rejects moving a folder under a parent with the same sibling folder name", () => {
  const folders = [
    createFolder({ id: "project", name: "Project" }),
    createFolder({ id: "docs", name: "docs", parentId: "project" }),
    createFolder({ id: "notes", name: "notes", parentId: "project" }),
    createFolder({ id: "notes-child", name: "notes", parentId: "docs" }),
  ];

  expect(() =>
    moveFolderWithPathPolicy(folders, {
      id: "notes-child",
      name: "notes",
      parentId: "project",
    }),
  ).toThrow(/already exists/i);
});

test("preserves visible extensions for document and image uploads from drag drop and picker flows", () => {
  expect(normalizePathAddressableUploadName("notes.md", "text/markdown", "document")).toBe(
    "notes.md",
  );
  expect(normalizePathAddressableUploadName("slides.PDF", "application/pdf", "document")).toBe(
    "slides.PDF",
  );
  expect(normalizePathAddressableUploadName("diagram.png", "image/png", "image")).toBe(
    "diagram.png",
  );
});
