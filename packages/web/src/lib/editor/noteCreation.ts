import { saveFileToOpfs } from "@/lib/library/fileStorage";
import { type WorkspaceFolderLike, findSiblingFileNameConflict } from "@/lib/editor/logicalPaths";
import type { FileMeta } from "@/types/library";

const MARKDOWN_MIME_TYPE = "text/markdown";
const DEFAULT_NOTE_NAME = "Untitled note.md";

export interface NoteCreationSettings {
  defaultNoteLocationMode: "root" | "folder";
  defaultNoteFolderId: string;
}

export interface NoteCreationDestination {
  requestedParentId: string | null;
  parentId: string | null;
  fellBackToRoot: boolean;
  missingFolderId: string | null;
}

export interface FileCreatedEventInput {
  id: string;
  name: string;
  type: "document";
  mimeType: string;
  sizeBytes: number;
  storageType: FileMeta["storageType"];
  storagePath: string;
  parentId: string | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: Date;
}

export interface CreateNewMarkdownNoteInput {
  settings: NoteCreationSettings;
  files: readonly Pick<FileMeta, "id" | "name" | "parentId">[];
  folders: readonly WorkspaceFolderLike[];
  initialContent?: string;
}

export interface CreateNewMarkdownNoteResult {
  id: string;
  meta: FileMeta;
  markdown: string;
  destination: NoteCreationDestination;
  createdEvent: FileCreatedEventInput;
}

const resolveDestination = ({
  settings,
  folders,
}: Pick<CreateNewMarkdownNoteInput, "settings" | "folders">): NoteCreationDestination => {
  if (settings.defaultNoteLocationMode !== "folder") {
    return {
      requestedParentId: null,
      parentId: null,
      fellBackToRoot: false,
      missingFolderId: null,
    };
  }

  const requestedParentId = settings.defaultNoteFolderId || null;
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
};

const buildUniqueName = ({
  files,
  parentId,
  preferredName,
}: {
  files: readonly Pick<FileMeta, "id" | "name" | "parentId">[];
  parentId: string | null;
  preferredName: string;
}): string => {
  const extension = ".md";
  const baseName = preferredName.endsWith(extension)
    ? preferredName.slice(0, -extension.length)
    : preferredName;

  let suffix = 1;
  while (true) {
    const name = suffix === 1 ? `${baseName}${extension}` : `${baseName} ${suffix}${extension}`;
    const conflict = findSiblingFileNameConflict(files, {
      name,
      parentId,
    });
    if (!conflict) {
      return name;
    }
    suffix += 1;
  }
};

const buildCreatedEvent = (meta: FileMeta): FileCreatedEventInput => {
  return {
    id: meta.id,
    name: meta.name,
    type: "document",
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

export const createNewMarkdownNote = async ({
  settings,
  files,
  folders,
  initialContent = "",
}: CreateNewMarkdownNoteInput): Promise<CreateNewMarkdownNoteResult> => {
  const destination = resolveDestination({ settings, folders });
  const name = buildUniqueName({
    files,
    parentId: destination.parentId,
    preferredName: DEFAULT_NOTE_NAME,
  });
  const result = await saveFileToOpfs({
    blob: new Blob([initialContent], { type: MARKDOWN_MIME_TYPE }),
    name,
    type: "document",
    mimeType: MARKDOWN_MIME_TYPE,
    parentId: destination.parentId,
  });

  return {
    id: result.id,
    meta: result.meta,
    markdown: initialContent,
    destination,
    createdEvent: buildCreatedEvent(result.meta),
  };
};
