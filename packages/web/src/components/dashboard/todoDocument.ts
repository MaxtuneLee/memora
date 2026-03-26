import { file as opfsFile, write as opfsWrite } from "@memora/fs";

import { saveFileToOpfs } from "@/lib/library/fileStorage";
import { fileEvents } from "@/livestore/file";
import type { FileMeta } from "@/types/library";

import {
  TODO_DOCUMENT_NAME,
  parseTodoMarkdown,
  serializeTodoMarkdown,
  type TodoTask,
} from "./todoMarkdown";

const TODO_DOCUMENT_MIME_TYPE = "text/markdown";

interface TodoStoreLike {
  commit: (...events: unknown[]) => void;
}

export interface TodoDocumentSnapshot {
  file: FileMeta;
  tasks: TodoTask[];
  markdown: string;
}

export const findTodoDocument = (files: FileMeta[]): FileMeta | null => {
  const matches = files
    .filter((file) => {
      return file.type === "document" && file.name === TODO_DOCUMENT_NAME;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return matches[0] ?? null;
};

const loadTodoDocument = async (
  file: FileMeta,
): Promise<TodoDocumentSnapshot> => {
  const markdown = await opfsFile(file.storagePath).text();

  return {
    file,
    tasks: parseTodoMarkdown(markdown),
    markdown,
  };
};

const createTodoDocument = async ({
  store,
}: {
  store: TodoStoreLike;
}): Promise<TodoDocumentSnapshot> => {
  const markdown = serializeTodoMarkdown([]);
  const result = await saveFileToOpfs({
    blob: new Blob([markdown], { type: TODO_DOCUMENT_MIME_TYPE }),
    name: TODO_DOCUMENT_NAME,
    type: "document",
    mimeType: TODO_DOCUMENT_MIME_TYPE,
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
}: {
  files: FileMeta[];
  store: TodoStoreLike;
}): Promise<TodoDocumentSnapshot> => {
  const existing = findTodoDocument(files);
  if (existing) {
    return loadTodoDocument(existing);
  }

  return createTodoDocument({ store });
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
  const markdown = serializeTodoMarkdown(tasks);
  const updatedAt = Date.now();
  const sizeBytes = new Blob([markdown]).size;
  const nextFile: FileMeta = {
    ...file,
    sizeBytes,
    updatedAt,
  };

  await opfsWrite(file.storagePath, markdown, { overwrite: true });
  await opfsWrite(file.metaPath, JSON.stringify(nextFile), { overwrite: true });

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
