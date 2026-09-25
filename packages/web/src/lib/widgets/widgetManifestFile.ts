import { file as opfsFile, write as opfsWrite } from "@memora/fs";

import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import { saveFileToOpfs } from "@/lib/library/fileStorage";
import { fileEvents, type file as LiveStoreFile } from "@/livestore/file";
import type { FileMeta } from "@/types/library";

import {
  WIDGET_MANIFEST_FILE_NAME,
  WIDGET_MANIFEST_MIME_TYPE,
  WIDGET_SOURCE_FILE_NAME,
  WIDGET_SOURCE_MIME_TYPE,
  serializeWidgetManifest,
  type WidgetManifest,
} from "./widgetManifest";

export interface WidgetFileStoreLike {
  commit: (...events: unknown[]) => void;
}

export const findWidgetManifestFile = (
  files: readonly LiveStoreFile[],
  folderId: string,
): LiveStoreFile | null =>
  files.find((file) => file.parentId === folderId && file.name === WIDGET_MANIFEST_FILE_NAME) ??
  null;

export const findWidgetSourceFile = (
  files: readonly LiveStoreFile[],
  folderId: string,
): LiveStoreFile | null =>
  files.find((file) => file.parentId === folderId && file.name === WIDGET_SOURCE_FILE_NAME) ?? null;

export const commitFileCreated = (store: WidgetFileStoreLike, meta: FileMeta): void => {
  store.commit(
    fileEvents.fileCreated({
      id: meta.id,
      name: meta.name,
      type: meta.type,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      storageType: meta.storageType,
      storagePath: meta.storagePath,
      parentId: meta.parentId ?? null,
      positionX: meta.positionX ?? null,
      positionY: meta.positionY ?? null,
      createdAt: new Date(meta.createdAt),
    }),
  );
};

// Writes widget.json for a brand-new definition folder, following the saveFileToOpfs +
// fileEvents.fileCreated pattern used by the Todo document.
export const createWidgetManifestFile = async ({
  store,
  folderId,
  manifest,
}: {
  store: WidgetFileStoreLike;
  folderId: string;
  manifest: WidgetManifest;
}): Promise<FileMeta> => {
  const json = serializeWidgetManifest(manifest);
  const result = await saveFileToOpfs({
    blob: new Blob([json], { type: WIDGET_MANIFEST_MIME_TYPE }),
    name: WIDGET_MANIFEST_FILE_NAME,
    type: "document",
    mimeType: WIDGET_MANIFEST_MIME_TYPE,
    parentId: folderId,
  });

  commitFileCreated(store, result.meta);
  return result.meta;
};

// Writes widget.html (the show_widget source, verbatim) for a generated definition folder.
export const createWidgetSourceFile = async ({
  store,
  folderId,
  code,
}: {
  store: WidgetFileStoreLike;
  folderId: string;
  code: string;
}): Promise<FileMeta> => {
  const result = await saveFileToOpfs({
    blob: new Blob([code], { type: WIDGET_SOURCE_MIME_TYPE }),
    name: WIDGET_SOURCE_FILE_NAME,
    type: "document",
    mimeType: WIDGET_SOURCE_MIME_TYPE,
    parentId: folderId,
  });

  commitFileCreated(store, result.meta);
  return result.meta;
};

// Overwrites an existing file's content in place, keeping its meta sidecar and the fileUpdated
// event's sizeBytes in sync. Shared by widget.json rewrites and data/ file writes (see ADR 0008)
// — both are "replace this Definition-owned file's content without changing its identity".
export const overwriteFileContentInOpfs = async ({
  store,
  file,
  content,
}: {
  store: WidgetFileStoreLike;
  file: LiveStoreFile;
  content: string;
}): Promise<void> => {
  const meta = mapLiveStoreFileToMeta(file);
  const updatedAt = Date.now();
  const nextMeta: FileMeta = { ...meta, sizeBytes: new Blob([content]).size, updatedAt };

  await opfsWrite(meta.storagePath, content, { overwrite: true });
  await opfsWrite(meta.metaPath, JSON.stringify(nextMeta), { overwrite: true });

  store.commit(
    fileEvents.fileUpdated({
      id: meta.id,
      sizeBytes: nextMeta.sizeBytes,
      updatedAt: new Date(updatedAt),
    }),
  );
};

// Rewrites an existing widget.json in place (create + update of a Definition both keep the
// manifest in sync with the table, which stays authoritative for the binding).
export const rewriteWidgetManifestFile = ({
  store,
  manifestFile,
  manifest,
}: {
  store: WidgetFileStoreLike;
  manifestFile: LiveStoreFile;
  manifest: WidgetManifest;
}): Promise<void> =>
  overwriteFileContentInOpfs({
    store,
    file: manifestFile,
    content: serializeWidgetManifest(manifest),
  });

// Reads and parses an existing widget.json. Returns null on any read/parse failure so callers
// (write validation, manifest-preserving renames) can treat a missing/corrupt manifest as "no
// declaration" rather than throwing.
export const readWidgetManifestFile = async (
  manifestFile: LiveStoreFile,
): Promise<WidgetManifest | null> => {
  try {
    const meta = mapLiveStoreFileToMeta(manifestFile);
    const text = await opfsFile(meta.storagePath).text();
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as WidgetManifest) : null;
  } catch {
    return null;
  }
};
