import { expect, test } from "vite-plus/test";

import { getFileHref as getSidebarRecentFileHref } from "@/app/components/Sidebar";
import { getFileHref as getDashboardRecentFileHref } from "@/components/dashboard/DashboardPage";
import { getFileOpenHref } from "@/components/desktop/DesktopPreviewWindow";
import { getFileHref as getLibraryFileHref } from "@/components/library/FilesPage";
import { buildFileSearchItems } from "@/lib/search/searchItems";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { FileMeta } from "@/types/library";

const createFileMeta = (overrides: Partial<FileMeta> = {}): FileMeta => {
  const id = overrides.id ?? "file-1";

  return {
    id,
    name: overrides.name ?? "Untitled.md",
    type: overrides.type ?? "document",
    mimeType: overrides.mimeType ?? "text/markdown",
    sizeBytes: overrides.sizeBytes ?? 128,
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

const createSearchFile = (overrides: Partial<LiveStoreFile> = {}): LiveStoreFile => {
  const id = overrides.id ?? "file-1";

  return {
    id,
    name: overrides.name ?? "Untitled.md",
    type: overrides.type ?? "document",
    mimeType: overrides.mimeType ?? "text/markdown",
    sizeBytes: overrides.sizeBytes ?? 128,
    storageType: overrides.storageType ?? "opfs",
    storagePath: overrides.storagePath ?? `/files/${id}/${id}.md`,
    parentId: overrides.parentId ?? null,
    positionX: overrides.positionX ?? null,
    positionY: overrides.positionY ?? null,
    transcriptPath: overrides.transcriptPath ?? null,
    indexedAt: overrides.indexedAt ?? null,
    indexStatus: overrides.indexStatus ?? "indexed",
    indexSummary: overrides.indexSummary ?? null,
    collectionId: overrides.collectionId ?? null,
    durationSec: overrides.durationSec ?? null,
    thumbnailPath: overrides.thumbnailPath ?? null,
    createdAt: overrides.createdAt ?? new Date(1_746_000_000_000),
    updatedAt: overrides.updatedAt ?? new Date(1_746_000_000_000),
    deletedAt: overrides.deletedAt ?? null,
    purgedAt: overrides.purgedAt ?? null,
  };
};

test("dashboard recent text files point to /editor/file/:id", () => {
  const markdownFile = createFileMeta({
    id: "doc-1",
    name: "notes.md",
    type: "document",
    mimeType: "text/markdown",
  });

  expect(getDashboardRecentFileHref(markdownFile)).toBe("/editor/file/doc-1");
});

test("sidebar recent text files point to /editor/file/:id while video still points to transcript", () => {
  const markdownFile = createFileMeta({
    id: "doc-1",
    name: "notes.md",
    type: "document",
    mimeType: "text/markdown",
  });
  const videoFile = createFileMeta({
    id: "video-1",
    name: "clip.mp4",
    type: "video",
    mimeType: "video/mp4",
  });

  expect(getSidebarRecentFileHref(markdownFile)).toBe("/editor/file/doc-1");
  expect(getSidebarRecentFileHref(videoFile)).toBe("/transcript/file/video-1");
});

test("desktop preview open action routes editable text files to the editor", () => {
  const markdownFile = createFileMeta({
    id: "doc-1",
    name: "notes.md",
    type: "document",
    mimeType: "text/markdown",
  });
  const audioFile = createFileMeta({
    id: "audio-1",
    name: "memo.webm",
    type: "audio",
    mimeType: "audio/webm",
  });

  expect(getFileOpenHref(markdownFile)).toBe("/editor/file/doc-1");
  expect(getFileOpenHref(audioFile)).toBe("/transcript/file/audio-1");
});

test("files page routes editable text documents to the editor", () => {
  const markdownFile = createFileMeta({
    id: "doc-1",
    name: "notes.md",
    type: "document",
    mimeType: "text/markdown",
  });
  const imageFile = createFileMeta({
    id: "image-1",
    name: "diagram.png",
    type: "image",
    mimeType: "image/png",
  });

  expect(getLibraryFileHref(markdownFile)).toBe("/editor/file/doc-1");
  expect(getLibraryFileHref(imageFile)).toBeNull();
});

test("global search routes editable text documents directly to the editor", () => {
  const markdownFile = {
    ...createSearchFile({
      id: "doc-1",
      name: "notes.md",
      type: "document",
      mimeType: "text/markdown",
    }),
  };
  const imageFile = {
    ...createSearchFile({
      id: "image-1",
      name: "diagram.png",
      type: "image",
      mimeType: "image/png",
    }),
  };

  const items = buildFileSearchItems([markdownFile, imageFile], []);
  const markdownItem = items.find((item) => item.id === "file:doc-1");
  const imageItem = items.find((item) => item.id === "file:image-1");

  expect(markdownItem?.intent).toEqual({
    type: "navigate",
    to: "/editor/file/doc-1",
  });
  expect(imageItem?.intent).toEqual({
    type: "desktop-intent",
    to: "/",
    desktopIntent: {
      type: "openPreview",
      fileId: "image-1",
    },
  });
});
