import {
  getFileExtension,
  inferPreferredEditableTextExtension,
  normalizeMimeType,
} from "@/lib/editor/editableTextDocument";

export interface WorkspaceFolderLike {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface WorkspaceFileLike {
  id: string;
  name: string;
  parentId?: string | null;
  mimeType?: string;
}

interface ResolveRelativeWorkspacePathInput<
  TFile extends WorkspaceFileLike = WorkspaceFileLike,
  TFolder extends WorkspaceFolderLike = WorkspaceFolderLike,
> {
  currentFile: TFile;
  files: readonly TFile[];
  folders: readonly TFolder[];
}

const INVALID_PATH_SEPARATOR_PATTERN = /[\\/]/g;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/gu;
const WHITESPACE_PATTERN = /\s+/g;

const toParentKey = (parentId: string | null | undefined): string | null => {
  return parentId ?? null;
};

const sanitizePathSegment = (segment: string, fallback: string): string => {
  const sanitized = segment
    .replace(INVALID_PATH_SEPARATOR_PATTERN, "-")
    .replace(CONTROL_CHARACTER_PATTERN, "")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return fallback;
  }

  return sanitized;
};

const splitFileName = (name: string): { baseName: string; extension: string } => {
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
    extension,
  };
};

const inferExtensionFromMimeType = (mimeType: string): string => {
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (!normalizedMimeType) {
    return "";
  }

  if (
    normalizedMimeType === "application/markdown" ||
    normalizedMimeType === "text/markdown" ||
    normalizedMimeType === "text/plain"
  ) {
    return inferPreferredEditableTextExtension(normalizedMimeType);
  }

  if (normalizedMimeType === "image/jpeg") {
    return ".jpg";
  }

  if (normalizedMimeType === "image/svg+xml") {
    return ".svg";
  }

  const subtype = normalizedMimeType.split("/")[1];
  if (!subtype) {
    return "";
  }

  const normalizedSubtype = subtype.split("+", 1)[0]?.trim();
  if (!normalizedSubtype) {
    return "";
  }

  return `.${normalizedSubtype.toLowerCase()}`;
};

const buildFolderMap = <TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[],
): Map<string, TFolder> => {
  return new Map(folders.map((folder) => [folder.id, folder]));
};

const buildFolderSegments = <TFolder extends WorkspaceFolderLike>(
  folderId: string | null | undefined,
  folders: readonly TFolder[],
): string[] => {
  const folderMap = buildFolderMap(folders);
  const segments: string[] = [];
  const visited = new Set<string>();
  let currentFolderId = folderId ?? null;

  while (currentFolderId) {
    if (visited.has(currentFolderId)) {
      break;
    }

    visited.add(currentFolderId);
    const folder = folderMap.get(currentFolderId);
    if (!folder) {
      break;
    }

    segments.unshift(sanitizePathSegment(folder.name, "Untitled folder"));
    currentFolderId = folder.parentId ?? null;
  }

  return segments;
};

const buildRelativePathFromSegments = (
  fromFolderSegments: readonly string[],
  targetSegments: readonly string[],
): string => {
  let commonLength = 0;

  while (
    commonLength < fromFolderSegments.length &&
    commonLength < targetSegments.length &&
    fromFolderSegments[commonLength] === targetSegments[commonLength]
  ) {
    commonLength += 1;
  }

  const upwardSegments = Array.from(
    { length: fromFolderSegments.length - commonLength },
    () => "..",
  );
  const downwardSegments = targetSegments.slice(commonLength);
  const pathSegments = [...upwardSegments, ...downwardSegments];

  if (pathSegments.length === 0) {
    return "./";
  }

  if (upwardSegments.length === 0) {
    return `./${pathSegments.join("/")}`;
  }

  return pathSegments.join("/");
};

const splitRelativePath = (relativePath: string): string[] => {
  return relativePath
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0);
};

const stripPathSuffix = (relativePath: string): string => {
  return relativePath.split("#", 1)[0]?.split("?", 1)[0]?.trim() ?? "";
};

const getMatchingFolders = <TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[],
  parentId: string | null,
  name: string,
): TFolder[] => {
  return folders.filter(
    (folder) => toParentKey(folder.parentId) === parentId && folder.name === name,
  );
};

const getMatchingFiles = <TFile extends WorkspaceFileLike>(
  files: readonly TFile[],
  parentId: string | null,
  name: string,
): TFile[] => {
  return files.filter((file) => toParentKey(file.parentId) === parentId && file.name === name);
};

export const normalizeLogicalName = (name: string, fallbackName = "Untitled"): string => {
  return sanitizePathSegment(name, fallbackName);
};

export const normalizeLogicalTextDocumentName = (name: string, mimeType: string): string => {
  const { baseName, extension } = splitFileName(name);
  const sanitizedBaseName = sanitizePathSegment(baseName || name, "Untitled note");

  if (extension === ".md" || extension === ".markdown" || extension === ".txt") {
    return `${sanitizedBaseName}${extension}`;
  }

  return `${sanitizedBaseName}${inferPreferredEditableTextExtension(mimeType)}`;
};

export const normalizeLogicalImageName = (
  name: string,
  mimeType: string,
  fallbackBaseName = "Image",
): string => {
  const { baseName, extension } = splitFileName(name);
  const sanitizedBaseName = sanitizePathSegment(baseName || name, fallbackBaseName);
  const preferredExtension = extension || inferExtensionFromMimeType(mimeType) || ".bin";

  return `${sanitizedBaseName}${preferredExtension.toLowerCase()}`;
};

export const findSiblingFileNameConflict = <TFile extends WorkspaceFileLike>(
  files: readonly TFile[],
  target: {
    excludingId?: string;
    name: string;
    parentId?: string | null;
  },
): TFile | null => {
  return (
    files.find((file) => {
      return (
        file.id !== target.excludingId &&
        toParentKey(file.parentId) === toParentKey(target.parentId) &&
        file.name === target.name
      );
    }) ?? null
  );
};

export const findSiblingFolderNameConflict = <TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[],
  target: {
    excludingId?: string;
    name: string;
    parentId?: string | null;
  },
): TFolder | null => {
  return (
    folders.find((folder) => {
      return (
        folder.id !== target.excludingId &&
        toParentKey(folder.parentId) === toParentKey(target.parentId) &&
        folder.name === target.name
      );
    }) ?? null
  );
};

export const assertUniqueSiblingFileName = <TFile extends WorkspaceFileLike>(
  files: readonly TFile[],
  target: {
    excludingId?: string;
    name: string;
    parentId?: string | null;
  },
): void => {
  const conflict = findSiblingFileNameConflict(files, target);
  if (conflict) {
    throw new Error(`A file named "${target.name}" already exists in this folder.`);
  }
};

export const assertUniqueSiblingFolderName = <TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[],
  target: {
    excludingId?: string;
    name: string;
    parentId?: string | null;
  },
): void => {
  const conflict = findSiblingFolderNameConflict(folders, target);
  if (conflict) {
    throw new Error(`A folder named "${target.name}" already exists in this folder.`);
  }
};

export const buildLogicalWorkspacePath = <
  TFile extends WorkspaceFileLike,
  TFolder extends WorkspaceFolderLike,
>(
  file: TFile,
  folders: readonly TFolder[],
): string => {
  const folderSegments = buildFolderSegments(file.parentId, folders);
  const normalizedFileName = normalizeLogicalName(file.name, "Untitled");

  return [...folderSegments, normalizedFileName].join("/");
};

export const buildRelativeWorkspacePath = <
  TFromFile extends WorkspaceFileLike,
  TTarget extends Pick<WorkspaceFileLike, "name" | "parentId">,
  TFolder extends WorkspaceFolderLike,
>(
  fromFile: TFromFile,
  target: TTarget,
  folders: readonly TFolder[],
): string => {
  const fromFolderSegments = buildFolderSegments(fromFile.parentId, folders);
  const targetSegments = [
    ...buildFolderSegments(target.parentId, folders),
    normalizeLogicalName(target.name, "Untitled"),
  ];

  return buildRelativePathFromSegments(fromFolderSegments, targetSegments);
};

export const resolveRelativeWorkspacePath = <
  TFile extends WorkspaceFileLike,
  TFolder extends WorkspaceFolderLike,
>(
  relativePath: string,
  scope: ResolveRelativeWorkspacePathInput<TFile, TFolder>,
): TFile => {
  const strippedPath = stripPathSuffix(relativePath);
  if (!strippedPath) {
    throw new Error("Reference path is empty.");
  }

  const pathSegments = splitRelativePath(strippedPath);
  if (pathSegments.length === 0) {
    throw new Error("Reference path is empty.");
  }

  let currentParentId = toParentKey(scope.currentFile.parentId);
  const folderMap = buildFolderMap(scope.folders);

  for (const segment of pathSegments.slice(0, -1)) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      currentParentId = currentParentId
        ? toParentKey(folderMap.get(currentParentId)?.parentId)
        : null;
      continue;
    }

    const matchingFolders = getMatchingFolders(scope.folders, currentParentId, segment);
    if (matchingFolders.length > 1) {
      throw new Error(`Reference path is ambiguous at folder "${segment}".`);
    }

    const nextFolder = matchingFolders[0];
    if (!nextFolder) {
      throw new Error(`Folder "${segment}" does not exist in the reference path.`);
    }

    currentParentId = nextFolder.id;
  }

  const fileSegment = pathSegments[pathSegments.length - 1];
  if (!fileSegment || fileSegment === "." || fileSegment === "..") {
    throw new Error(`Reference path must end with a file name: "${relativePath}".`);
  }

  const matchingFiles = getMatchingFiles(scope.files, currentParentId, fileSegment);
  if (matchingFiles.length > 1) {
    throw new Error(`Reference path is ambiguous for file "${fileSegment}".`);
  }

  const resolvedFile = matchingFiles[0];
  if (!resolvedFile) {
    throw new Error(`File "${fileSegment}" does not exist in the reference path.`);
  }

  return resolvedFile;
};
