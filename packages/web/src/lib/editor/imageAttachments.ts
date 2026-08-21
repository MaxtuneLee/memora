import { saveFileToOpfs } from "@/lib/library/fileStorage";
import {
  buildRelativeWorkspacePath,
  findSiblingFileNameConflict,
  findSiblingFolderNameConflict,
  normalizeLogicalImageName,
  normalizeLogicalName,
  type WorkspaceFolderLike,
} from "@/lib/editor/logicalPaths";
import type { TextDocumentFileLike } from "@/lib/editor/documentPersistence";
import type { FileMeta } from "@/types/library";

export interface AttachmentPlacementSettings {
  attachmentPlacementMode: "root" | "fixed-folder" | "current-folder" | "current-subfolder";
  attachmentFolderId: string;
  attachmentSubfolderName: string;
}

export interface FolderCreatedEventInput {
  id: string;
  name: string;
  parentId: string | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: Date;
}

export interface FileCreatedEventInput {
  id: string;
  name: string;
  type: "image";
  mimeType: string;
  sizeBytes: number;
  storageType: FileMeta["storageType"];
  storagePath: string;
  parentId: string | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: Date;
}

export interface AttachmentDestination {
  requestedParentId: string | null;
  parentId: string | null;
  fellBackToRoot: boolean;
  missingFolderId: string | null;
}

export interface SaveImageAttachmentInput {
  currentFile: Pick<TextDocumentFileLike, "id" | "name" | "parentId">;
  files: readonly Pick<FileMeta, "id" | "name" | "parentId">[];
  folders: readonly WorkspaceFolderLike[];
  image: File;
  settings: AttachmentPlacementSettings;
}

export interface SaveImageAttachmentResult {
  meta: FileMeta;
  destination: AttachmentDestination;
  markdownPath: string;
  createdFolderEvent: FolderCreatedEventInput | null;
  createdFileEvent: FileCreatedEventInput;
}

const IMAGE_SUBFOLDER_FALLBACK_NAME = "images";

const encodeRelativeMarkdownPath = (relativePath: string): string => {
  return relativePath
    .split("/")
    .map((segment) => {
      if (segment === "." || segment === ".." || segment.length === 0) {
        return segment;
      }

      return encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29");
    })
    .join("/");
};

const buildUniqueImageName = ({
  files,
  parentId,
  preferredName,
  mimeType,
}: {
  files: readonly Pick<FileMeta, "id" | "name" | "parentId">[];
  parentId: string | null;
  preferredName: string;
  mimeType: string;
}): string => {
  const normalizedName = normalizeLogicalImageName(preferredName, mimeType);
  const extensionIndex = normalizedName.lastIndexOf(".");
  const baseName = extensionIndex > 0 ? normalizedName.slice(0, extensionIndex) : normalizedName;
  const extension = extensionIndex > 0 ? normalizedName.slice(extensionIndex) : "";

  let suffix = 1;
  while (true) {
    const nextName = suffix === 1 ? `${baseName}${extension}` : `${baseName} ${suffix}${extension}`;
    const conflict = findSiblingFileNameConflict(files, {
      name: nextName,
      parentId,
    });
    if (!conflict) {
      return nextName;
    }
    suffix += 1;
  }
};

const buildAttachmentDestination = ({
  currentFile,
  folders,
  settings,
}: Pick<
  SaveImageAttachmentInput,
  "currentFile" | "folders" | "settings"
>): AttachmentDestination => {
  const currentParentId = currentFile.parentId ?? null;
  const currentFolderExists = currentParentId
    ? folders.some((folder) => folder.id === currentParentId)
    : true;

  switch (settings.attachmentPlacementMode) {
    case "root":
      return {
        requestedParentId: null,
        parentId: null,
        fellBackToRoot: false,
        missingFolderId: null,
      };
    case "fixed-folder": {
      const requestedParentId = settings.attachmentFolderId || null;
      if (!requestedParentId) {
        return {
          requestedParentId: null,
          parentId: null,
          fellBackToRoot: false,
          missingFolderId: null,
        };
      }

      const folderExists = folders.some((folder) => folder.id === requestedParentId);
      if (folderExists) {
        return {
          requestedParentId,
          parentId: requestedParentId,
          fellBackToRoot: false,
          missingFolderId: null,
        };
      }

      return {
        requestedParentId,
        parentId: null,
        fellBackToRoot: true,
        missingFolderId: requestedParentId,
      };
    }
    case "current-folder":
    case "current-subfolder":
      if (currentFolderExists) {
        return {
          requestedParentId: currentParentId,
          parentId: currentParentId,
          fellBackToRoot: false,
          missingFolderId: null,
        };
      }

      return {
        requestedParentId: currentParentId,
        parentId: null,
        fellBackToRoot: currentParentId !== null,
        missingFolderId: currentParentId,
      };
  }
};

const ensureCurrentSubfolder = ({
  destination,
  folders,
  settings,
}: {
  destination: AttachmentDestination;
  folders: readonly WorkspaceFolderLike[];
  settings: AttachmentPlacementSettings;
}): {
  parentId: string;
  folder: WorkspaceFolderLike;
  createdFolderEvent: FolderCreatedEventInput | null;
} => {
  const folderName = normalizeLogicalName(
    settings.attachmentSubfolderName,
    IMAGE_SUBFOLDER_FALLBACK_NAME,
  );
  const existingFolder =
    findSiblingFolderNameConflict(folders, {
      name: folderName,
      parentId: destination.parentId,
    }) ?? null;

  if (existingFolder) {
    return {
      parentId: existingFolder.id,
      folder: existingFolder,
      createdFolderEvent: null,
    };
  }

  const createdAt = new Date();
  const id = crypto.randomUUID();
  const createdFolderEvent: FolderCreatedEventInput = {
    id,
    name: folderName,
    parentId: destination.parentId,
    positionX: null,
    positionY: null,
    createdAt,
  };

  return {
    parentId: id,
    folder: {
      id,
      name: folderName,
      parentId: destination.parentId,
    },
    createdFolderEvent,
  };
};

const buildFileCreatedEvent = (meta: FileMeta): FileCreatedEventInput => {
  return {
    id: meta.id,
    name: meta.name,
    type: "image",
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeBytes,
    storageType: meta.storageType,
    storagePath: meta.storagePath,
    parentId: meta.parentId ?? null,
    positionX: meta.positionX ?? null,
    positionY: meta.positionY ?? null,
    createdAt: new Date(meta.createdAt),
  };
};

export const saveImageAttachment = async ({
  currentFile,
  files,
  folders,
  image,
  settings,
}: SaveImageAttachmentInput): Promise<SaveImageAttachmentResult> => {
  if (!image.type.trim().startsWith("image/")) {
    throw new Error("Only image files can be attached.");
  }

  const destination = buildAttachmentDestination({
    currentFile,
    folders,
    settings,
  });
  let targetParentId = destination.parentId;
  let createdFolderEvent: FolderCreatedEventInput | null = null;
  let foldersForPath = folders;

  if (settings.attachmentPlacementMode === "current-subfolder") {
    const ensuredSubfolder = ensureCurrentSubfolder({
      destination,
      folders,
      settings,
    });
    targetParentId = ensuredSubfolder.parentId;
    createdFolderEvent = ensuredSubfolder.createdFolderEvent;
    foldersForPath = createdFolderEvent === null ? folders : [...folders, ensuredSubfolder.folder];
  }

  const nextName = buildUniqueImageName({
    files,
    parentId: targetParentId,
    preferredName: image.name,
    mimeType: image.type,
  });
  const saveResult = await saveFileToOpfs({
    blob: image,
    name: nextName,
    type: "image",
    mimeType: image.type,
    parentId: targetParentId,
  });
  const markdownPath = encodeRelativeMarkdownPath(
    buildRelativeWorkspacePath(
      currentFile,
      {
        name: saveResult.meta.name,
        parentId: saveResult.meta.parentId ?? null,
      },
      foldersForPath,
    ),
  );

  return {
    meta: saveResult.meta,
    destination,
    markdownPath,
    createdFolderEvent,
    createdFileEvent: buildFileCreatedEvent(saveResult.meta),
  };
};
