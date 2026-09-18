import { file as opfsFile, write as opfsWrite } from "@memora/fs";

import { saveFileToOpfs } from "@/lib/library/fileStorage";
import { fileEvents } from "@/livestore/file";
import { FILE_META_SUFFIX, type FileMeta } from "@/types/library";

import {
  TODO_DOCUMENT_NAME,
  parseTodoMarkdown,
  serializeTodoMarkdown,
  type TodoTask,
} from "./todoMarkdown";

const TODO_DOCUMENT_MIME_TYPE = "text/markdown";
let pendingTodoDocumentCreation: Promise<TodoDocumentSnapshot> | null = null;
let cachedTodoDocumentSnapshot: TodoDocumentSnapshot | null = null;

interface TodoStoreLike {
  commit: (...events: unknown[]) => void;
}

export interface TodoDocumentSnapshot {
  file: FileMeta;
  tasks: TodoTask[];
  markdown: string;
}

export const resetTodoDocumentStateForTests = (): void => {
  pendingTodoDocumentCreation = null;
  cachedTodoDocumentSnapshot = null;
};

// Looks inside the Todo Widget Definition folder first (the current home for the Today Tasks
// document); falls back to a name-based search across every file for legacy data that has not
// been migrated into that folder yet.
export const findTodoDocument = (
  files: FileMeta[],
  todoFolderId?: string | null,
): FileMeta | null => {
  const isTodoDocument = (file: FileMeta) =>
    file.type === "document" && file.name === TODO_DOCUMENT_NAME;

  if (todoFolderId) {
    const inFolder = files
      .filter((file) => isTodoDocument(file) && file.parentId === todoFolderId)
      .sort((left, right) => right.updatedAt - left.updatedAt);
    if (inFolder[0]) {
      return inFolder[0];
    }
  }

  const matches = files
    .filter(isTodoDocument)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return matches[0] ?? null;
};

const buildTodoMetaPath = (file: Pick<FileMeta, "id" | "storagePath">): string => {
  if (file.storagePath.endsWith(".md")) {
    return file.storagePath.slice(0, -".md".length) + FILE_META_SUFFIX;
  }

  const extensionIndex = file.storagePath.lastIndexOf(".");
  if (extensionIndex >= 0) {
    return file.storagePath.slice(0, extensionIndex) + FILE_META_SUFFIX;
  }

  return `/files/${file.id}/${file.id}${FILE_META_SUFFIX}`;
};

const hydrateTodoFileMeta = (file: FileMeta): FileMeta => {
  const cachedMetaPath =
    cachedTodoDocumentSnapshot?.file.id === file.id
      ? cachedTodoDocumentSnapshot.file.metaPath
      : undefined;

  return {
    ...file,
    metaPath: file.metaPath ?? cachedMetaPath ?? buildTodoMetaPath(file),
  };
};

const loadTodoDocument = async (file: FileMeta): Promise<TodoDocumentSnapshot> => {
  const hydratedFile = hydrateTodoFileMeta(file);
  const markdown = await opfsFile(hydratedFile.storagePath).text();

  return {
    file: hydratedFile,
    tasks: parseTodoMarkdown(markdown),
    markdown,
  };
};

const createTodoDocument = async ({
  store,
  todoFolderId,
}: {
  store: TodoStoreLike;
  todoFolderId?: string | null;
}): Promise<TodoDocumentSnapshot> => {
  const markdown = serializeTodoMarkdown([]);
  const result = await saveFileToOpfs({
    blob: new Blob([markdown], { type: TODO_DOCUMENT_MIME_TYPE }),
    name: TODO_DOCUMENT_NAME,
    type: "document",
    mimeType: TODO_DOCUMENT_MIME_TYPE,
    parentId: todoFolderId ?? null,
  });

  store.commit(
    fileEvents.fileCreated({
      id: result.id,
      name: result.meta.name,
      type: result.meta.type,
      mimeType: result.meta.mimeType,
      sizeBytes: result.meta.sizeBytes,
      storageType: result.meta.storageType,
      storagePath: result.meta.storagePath,
      parentId: result.meta.parentId ?? null,
      positionX: result.meta.positionX ?? null,
      positionY: result.meta.positionY ?? null,
      createdAt: new Date(result.meta.createdAt),
    }),
  );

  return {
    file: result.meta,
    tasks: [],
    markdown,
  };
};

export const ensureTodoDocument = async ({
  files,
  store,
  todoFolderId,
}: {
  files: FileMeta[];
  store: TodoStoreLike;
  todoFolderId?: string | null;
}): Promise<TodoDocumentSnapshot> => {
  const existing = findTodoDocument(files, todoFolderId);
  if (existing) {
    const snapshot = await loadTodoDocument(existing);
    cachedTodoDocumentSnapshot = snapshot;
    return snapshot;
  }

  if (cachedTodoDocumentSnapshot) {
    return cachedTodoDocumentSnapshot;
  }

  if (pendingTodoDocumentCreation) {
    return pendingTodoDocumentCreation;
  }

  const creation = createTodoDocument({ store, todoFolderId });
  const pendingCreation = creation.finally(() => {
    if (pendingTodoDocumentCreation === pendingCreation) {
      pendingTodoDocumentCreation = null;
    }
  });
  void creation.then((snapshot) => {
    cachedTodoDocumentSnapshot = snapshot;
  });
  pendingTodoDocumentCreation = pendingCreation;

  return pendingTodoDocumentCreation;
};

export const saveTodoDocument = async ({
  file,
  store,
  tasks,
}: {
  file: FileMeta;
  store: TodoStoreLike;
  tasks: TodoTask[];
}): Promise<TodoDocumentSnapshot> => {
  const hydratedFile = hydrateTodoFileMeta(file);
  const markdown = serializeTodoMarkdown(tasks);
  const updatedAt = Date.now();
  const sizeBytes = new Blob([markdown]).size;
  const nextFile: FileMeta = {
    ...hydratedFile,
    sizeBytes,
    updatedAt,
  };

  await opfsWrite(hydratedFile.storagePath, markdown, { overwrite: true });
  await opfsWrite(hydratedFile.metaPath, JSON.stringify(nextFile), { overwrite: true });

  store.commit(
    fileEvents.fileUpdated({
      id: file.id,
      name: nextFile.name,
      mimeType: nextFile.mimeType,
      sizeBytes: nextFile.sizeBytes,
      storageType: nextFile.storageType,
      storagePath: nextFile.storagePath,
      updatedAt: new Date(updatedAt),
    }),
  );

  return {
    file: nextFile,
    tasks,
    markdown,
  };
};
