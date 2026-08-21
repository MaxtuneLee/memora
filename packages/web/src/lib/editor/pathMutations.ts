import { getFileExtension } from "@/lib/editor/editableTextDocument";
import {
  assertUniqueSiblingFileName,
  assertUniqueSiblingFolderName,
  normalizeLogicalImageName,
  normalizeLogicalName,
  normalizeLogicalTextDocumentName,
  type WorkspaceFileLike,
  type WorkspaceFolderLike,
} from "@/lib/editor/logicalPaths";
import type { FileType } from "@/types/library";

type PathAddressableFileType = Extract<FileType, "document" | "image">;

type PathAddressableTarget = {
  excludingId?: string;
  name: string;
  parentId?: string | null;
  type?: FileType;
};

type FolderTarget = {
  excludingId?: string;
  name: string;
  parentId?: string | null;
};

type FileBatchRow = WorkspaceFileLike & {
  type?: FileType;
  deletedAt?: Date | null;
  purgedAt?: Date | null;
};

type FolderBatchRow = WorkspaceFolderLike & {
  deletedAt?: Date | null;
  purgedAt?: Date | null;
};

const isPathAddressableFileType = (type: FileType | undefined): type is PathAddressableFileType => {
  return type === "document" || type === "image";
};

const splitVisibleExtension = (name: string): { baseName: string; extension: string } => {
  const trimmedName = name.trim();
  const extension = getFileExtension(trimmedName);
  if (!extension) {
    return {
      baseName: trimmedName,
      extension: "",
    };
  }

  return {
    baseName: trimmedName.slice(0, -extension.length),
    extension: trimmedName.slice(-extension.length),
  };
};

export const assertUniquePathAddressableSiblingFileName = <TFile extends WorkspaceFileLike>(
  files: readonly TFile[],
  target: PathAddressableTarget,
): void => {
  if (!isPathAddressableFileType(target.type)) {
    return;
  }

  assertUniqueSiblingFileName(files, {
    excludingId: target.excludingId,
    name: target.name,
    parentId: target.parentId,
  });
};

export const assertUniqueFolderSiblingName = <TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[],
  target: FolderTarget,
): void => {
  assertUniqueSiblingFolderName(folders, {
    excludingId: target.excludingId,
    name: target.name,
    parentId: target.parentId,
  });
};

export const renamePathAddressableFile = <TFile extends WorkspaceFileLike>(
  files: readonly TFile[],
  target: PathAddressableTarget & { id: string },
): string => {
  assertUniquePathAddressableSiblingFileName(files, {
    excludingId: target.id,
    name: target.name,
    parentId: target.parentId,
    type: target.type,
  });

  return target.name;
};

export const movePathAddressableFileWithPathPolicy = <TFile extends WorkspaceFileLike>(
  files: readonly TFile[],
  target: PathAddressableTarget & { id: string },
): string | null => {
  assertUniquePathAddressableSiblingFileName(files, {
    excludingId: target.id,
    name: target.name,
    parentId: target.parentId,
    type: target.type,
  });

  return target.parentId ?? null;
};

export const createFolderWithPathPolicy = <TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[],
  target: FolderTarget,
): string => {
  assertUniqueFolderSiblingName(folders, target);
  return target.name;
};

export const renameFolderWithPathPolicy = <TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[],
  target: FolderTarget & { id: string },
): string => {
  assertUniqueFolderSiblingName(folders, {
    excludingId: target.id,
    name: target.name,
    parentId: target.parentId,
  });

  return target.name;
};

export const moveFolderWithPathPolicy = <TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[],
  target: FolderTarget & { id: string },
): string | null => {
  assertUniqueFolderSiblingName(folders, {
    excludingId: target.id,
    name: target.name,
    parentId: target.parentId,
  });

  return target.parentId ?? null;
};

export const normalizePathAddressableUploadName = (
  name: string,
  mimeType: string,
  type: PathAddressableFileType,
  sourceName = name,
): string => {
  const sourceExtension = splitVisibleExtension(sourceName).extension;

  if (type === "image") {
    const { baseName, extension } = splitVisibleExtension(name);
    if (extension) {
      return `${normalizeLogicalName(baseName || name, "Image")}${extension}`;
    }
    if (sourceExtension) {
      return `${normalizeLogicalName(baseName || name, "Image")}${sourceExtension}`;
    }
    return normalizeLogicalImageName(name, mimeType, "Image");
  }

  const { baseName, extension } = splitVisibleExtension(name);
  if (extension) {
    return `${normalizeLogicalName(baseName || name, "Untitled note")}${extension}`;
  }
  if (sourceExtension) {
    return `${normalizeLogicalName(baseName || name, "Untitled note")}${sourceExtension}`;
  }

  return normalizeLogicalTextDocumentName(name, mimeType);
};

export const prepareUploadNameWithPathPolicy = <TFile extends WorkspaceFileLike>(
  files: readonly TFile[],
  target: {
    name: string;
    mimeType: string;
    parentId?: string | null;
    sourceName?: string;
    type: FileType;
  },
): string => {
  if (!isPathAddressableFileType(target.type)) {
    return target.name;
  }

  const normalizedName = normalizePathAddressableUploadName(
    target.name,
    target.mimeType,
    target.type,
    target.sourceName,
  );
  assertUniquePathAddressableSiblingFileName(files, {
    name: normalizedName,
    parentId: target.parentId,
    type: target.type,
  });

  return normalizedName;
};

export const assertNoPathMutationConflicts = <
  TFile extends FileBatchRow,
  TFolder extends FolderBatchRow,
>(input: {
  files: readonly TFile[];
  folders: readonly TFolder[];
}): void => {
  const activeFolders = input.folders.filter((folder) => !folder.deletedAt && !folder.purgedAt);
  const activeFiles = input.files.filter((file) => !file.deletedAt && !file.purgedAt);

  for (const folder of activeFolders) {
    assertUniqueFolderSiblingName(activeFolders, {
      excludingId: folder.id,
      name: folder.name,
      parentId: folder.parentId,
    });
  }

  for (const file of activeFiles) {
    assertUniquePathAddressableSiblingFileName(activeFiles, {
      excludingId: file.id,
      name: file.name,
      parentId: file.parentId,
      type: file.type,
    });
  }
};

export { isPathAddressableFileType };
