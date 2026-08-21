import { file as opfsFile, write as opfsWrite } from "@memora/fs";

import { normalizeLogicalName, findSiblingFileNameConflict } from "@/lib/editor/logicalPaths";
import {
  getFileExtension,
  isEditableTextDocument,
  normalizeEditableTextDocumentName,
} from "@/lib/editor/editableTextDocument";
import { FILE_META_SUFFIX, type FileMeta } from "@/types/library";

const MARKDOWN_MIME_TYPE = "text/markdown";

export interface TextDocumentFileLike
  extends Omit<FileMeta, "metaPath">, Partial<Pick<FileMeta, "metaPath">> {}

export interface FileUpdatedEventInput {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageType: FileMeta["storageType"];
  storagePath: string;
  updatedAt: Date;
}

export interface SaveTextDocumentInput {
  file: TextDocumentFileLike;
  text: string;
  name?: string;
  mimeType?: string;
}

export interface SaveTextDocumentResult {
  file: FileMeta;
  text: string;
  textBytes: Uint8Array;
  updatedEvent: FileUpdatedEventInput;
}

export interface UpgradeTextFileToMarkdownInput {
  file: TextDocumentFileLike;
  text: string;
  files?: readonly Pick<FileMeta, "id" | "name" | "parentId">[];
}

const buildMetaPath = (file: Pick<TextDocumentFileLike, "id" | "storagePath">): string => {
  if (file.storagePath.endsWith(".md")) {
    return file.storagePath.slice(0, -".md".length) + FILE_META_SUFFIX;
  }

  const extensionIndex = file.storagePath.lastIndexOf(".");
  if (extensionIndex >= 0) {
    return file.storagePath.slice(0, extensionIndex) + FILE_META_SUFFIX;
  }

  return `/files/${file.id}/${file.id}${FILE_META_SUFFIX}`;
};

const resolveMetaPath = (file: TextDocumentFileLike): string => {
  return file.metaPath ?? buildMetaPath(file);
};

const buildUpdatedEvent = (file: FileMeta): FileUpdatedEventInput => {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    storageType: file.storageType,
    storagePath: file.storagePath,
    updatedAt: new Date(file.updatedAt),
  };
};

const buildUniqueMarkdownName = ({
  file,
  files,
}: {
  file: Pick<TextDocumentFileLike, "id" | "name" | "parentId">;
  files: readonly Pick<FileMeta, "id" | "name" | "parentId">[];
}): string => {
  const currentExtension = getFileExtension(file.name);
  const baseName = currentExtension ? file.name.slice(0, -currentExtension.length) : file.name;
  const normalizedBaseName = normalizeLogicalName(baseName, "Untitled note");

  let suffix = 1;
  while (true) {
    const name = suffix === 1 ? `${normalizedBaseName}.md` : `${normalizedBaseName} ${suffix}.md`;
    const conflict = findSiblingFileNameConflict(files, {
      excludingId: file.id,
      name,
      parentId: file.parentId ?? null,
    });
    if (!conflict) {
      return name;
    }
    suffix += 1;
  }
};

export const readTextDocumentBytes = async (
  file: Pick<TextDocumentFileLike, "storagePath">,
): Promise<Uint8Array> => {
  return new Uint8Array(await opfsFile(file.storagePath).arrayBuffer());
};

export const saveTextDocument = async ({
  file,
  text,
  name,
  mimeType,
}: SaveTextDocumentInput): Promise<SaveTextDocumentResult> => {
  const textBytes = new TextEncoder().encode(text);
  const updatedAt = Date.now();
  const resolvedMimeType = mimeType ?? file.mimeType;
  const resolvedName = name ?? file.name;
  const normalizedName = isEditableTextDocument({
    ...file,
    name: resolvedName,
    mimeType: resolvedMimeType,
  })
    ? normalizeEditableTextDocumentName(resolvedName, resolvedMimeType)
    : resolvedName;
  const nextFile: FileMeta = {
    ...file,
    name: normalizedName,
    mimeType: resolvedMimeType,
    sizeBytes: textBytes.byteLength,
    metaPath: resolveMetaPath(file),
    parentId: file.parentId ?? null,
    positionX: file.positionX ?? null,
    positionY: file.positionY ?? null,
    durationSec: file.durationSec ?? null,
    transcriptPath: file.transcriptPath ?? null,
    transcriptPreview: file.transcriptPreview ?? null,
    updatedAt,
  };

  await opfsWrite(nextFile.storagePath, textBytes, { overwrite: true });
  await opfsWrite(nextFile.metaPath, JSON.stringify(nextFile), { overwrite: true });

  return {
    file: nextFile,
    text,
    textBytes,
    updatedEvent: buildUpdatedEvent(nextFile),
  };
};

export const upgradeTextFileToMarkdown = async ({
  file,
  text,
  files = [],
}: UpgradeTextFileToMarkdownInput): Promise<SaveTextDocumentResult> => {
  const nextName = buildUniqueMarkdownName({
    file,
    files,
  });

  return saveTextDocument({
    file,
    text,
    name: nextName,
    mimeType: MARKDOWN_MIME_TYPE,
  });
};
