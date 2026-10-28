import { expect, test } from "vite-plus/test";

import { isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import {
  buildLogicalWorkspacePath,
  buildRelativeWorkspacePath,
  resolveRelativeWorkspacePath,
  resolveWikiLinkTarget,
  type WorkspaceFolderLike,
} from "@/lib/editor/logicalPaths";
import type { FileMeta } from "@/types/library";

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
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    durationSec: overrides.durationSec ?? null,
    transcriptPath: overrides.transcriptPath ?? null,
    transcriptPreview: overrides.transcriptPreview ?? null,
  } satisfies FileMeta;
};

const createFolder = (overrides: Partial<WorkspaceFolderLike> = {}): WorkspaceFolderLike => {
  return {
    id: overrides.id ?? "folder-1",
    name: overrides.name ?? "Folder",
    parentId: overrides.parentId ?? null,
  };
};

test("recognizes editable markdown and plain-text documents", () => {
  const markdownFile = createFile({
    id: "markdown-file",
    name: "Parser notes.md",
    mimeType: "text/markdown",
  });
  const textFile = createFile({
    id: "text-file",
    name: "scratch.txt",
    mimeType: "application/octet-stream",
  });
  const pdfFile = createFile({
    id: "pdf-file",
    name: "slides.pdf",
    mimeType: "application/pdf",
  });

  expect(isEditableTextDocument(markdownFile)).toBe(true);
  expect(isEditableTextDocument(textFile)).toBe(true);
  expect(isEditableTextDocument(pdfFile)).toBe(false);
});

test("builds a logical workspace path from folder ancestry and file name", () => {
  const folders = [
    createFolder({ id: "project", name: "Project" }),
    createFolder({ id: "docs", name: "docs", parentId: "project" }),
  ];
  const noteEntry = createFile({
    id: "note-entry",
    name: "parser.md",
    parentId: "docs",
  });

  expect(buildLogicalWorkspacePath(noteEntry, folders)).toBe("Project/docs/parser.md");
});

test("builds a workspace-relative attachment path from note to sibling subfolder", () => {
  const folders = [
    createFolder({ id: "project", name: "Project" }),
    createFolder({ id: "images", name: "images", parentId: "project" }),
  ];
  const noteEntry = createFile({
    id: "note-entry",
    name: "parser.md",
    parentId: "project",
  });
  const imageEntry = createFile({
    id: "image-entry",
    name: "diagram.png",
    type: "image",
    mimeType: "image/png",
    parentId: "images",
  });

  expect(buildRelativeWorkspacePath(noteEntry, imageEntry, folders)).toBe("./images/diagram.png");
});

test("resolves a relative workspace path to the matching file", () => {
  const folders = [
    createFolder({ id: "project", name: "Project" }),
    createFolder({ id: "docs", name: "docs", parentId: "project" }),
    createFolder({ id: "notes", name: "notes", parentId: "project" }),
  ];
  const currentFile = createFile({
    id: "current-file",
    name: "today.md",
    parentId: "docs",
  });
  const targetFile = createFile({
    id: "target-file",
    name: "parser.md",
    parentId: "notes",
  });

  const resolved = resolveRelativeWorkspacePath("../notes/parser.md", {
    currentFile,
    folders,
    files: [currentFile, targetFile],
  });

  expect(resolved).toEqual(targetFile);
});

test("rejects ambiguous path resolution when duplicate sibling folders exist", () => {
  const folders = [
    createFolder({ id: "project", name: "Project" }),
    createFolder({ id: "docs", name: "docs", parentId: "project" }),
    createFolder({ id: "notes-a", name: "notes", parentId: "project" }),
    createFolder({ id: "notes-b", name: "notes", parentId: "project" }),
  ];
  const currentFile = createFile({
    id: "current-file",
    name: "today.md",
    parentId: "docs",
  });
  const files = [
    currentFile,
    createFile({
      id: "target-file-a",
      name: "parser.md",
      parentId: "notes-a",
    }),
    createFile({
      id: "target-file-b",
      name: "parser.md",
      parentId: "notes-b",
    }),
  ];

  expect(() =>
    resolveRelativeWorkspacePath("../notes/parser.md", {
      currentFile,
      folders,
      files,
    }),
  ).toThrow(/ambiguous/i);
});

test("resolves wiki link targets by path or by a unique name", () => {
  const folders: WorkspaceFolderLike[] = [{ id: "folder-notes", name: "notes", parentId: null }];
  const current = createFile({ id: "current", name: "Current.md" });
  const parser = createFile({ id: "parser", name: "Parser notes.md", parentId: "folder-notes" });
  const twinA = createFile({ id: "twin-a", name: "Twin.md" });
  const twinB = createFile({ id: "twin-b", name: "Twin.md", parentId: "folder-notes" });
  const scope = { currentFile: current, files: [current, parser, twinA, twinB], folders };

  expect(resolveWikiLinkTarget("notes/Parser notes", scope)?.id).toBe("parser");
  expect(resolveWikiLinkTarget("parser notes#Usage", scope)?.id).toBe("parser");
  expect(resolveWikiLinkTarget("Current.md", scope)?.id).toBe("current");
  expect(resolveWikiLinkTarget("Missing", scope)).toBeNull();
  // Two files share the name; the one next to the current note wins by relative path.
  expect(resolveWikiLinkTarget("Twin", scope)?.id).toBe("twin-a");
  expect(resolveWikiLinkTarget("notes/../nowhere/Twin", scope)).toBeNull();
});
