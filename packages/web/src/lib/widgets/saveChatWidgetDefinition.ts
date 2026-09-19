import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { DataSourceName } from "@/livestore/widget";

import { createWidgetDefinition, type WidgetDefinitionStoreLike } from "./widgetDefinitions";
import {
  createWidgetDefinitionFolder,
  ensureWidgetsRootFolder,
  widgetFoldersQuery$,
  type WidgetFolderStoreLike,
} from "./widgetFolders";
import { buildWidgetManifest } from "./widgetManifest";
import { createWidgetManifestFile, createWidgetSourceFile } from "./widgetManifestFile";
import type { WidgetQueryableStore } from "./widgetStore";

export interface SaveChatWidgetDefinitionInput {
  id: string;
  name: string;
  widgetCode: string;
  dataSourceName?: DataSourceName;
  dataSourceParams?: Record<string, unknown>;
  // File names this Definition may write via writeData once saved (see ADR 0008).
  dataFiles?: string[];
}

export type SaveChatWidgetDefinitionResult =
  | { ok: true }
  | { ok: false; reason: "missing-data-source" | "missing-widget-code" };

export interface SaveChatWidgetDefinitionStore
  extends WidgetDefinitionStoreLike, WidgetFolderStoreLike, WidgetQueryableStore {}

export const saveChatWidgetDefinition = async ({
  store,
  input,
}: {
  store: SaveChatWidgetDefinitionStore;
  input: SaveChatWidgetDefinitionInput;
}): Promise<SaveChatWidgetDefinitionResult> => {
  if (!input.dataSourceName) {
    return { ok: false, reason: "missing-data-source" };
  }

  if (!input.widgetCode.trim()) {
    return { ok: false, reason: "missing-widget-code" };
  }

  const folders = store.query(widgetFoldersQuery$) as readonly LiveStoreFolder[];
  const { folder: rootFolder } = ensureWidgetsRootFolder({ store, folders });
  const { folder: definitionFolder } = createWidgetDefinitionFolder({
    store,
    folders,
    rootId: rootFolder.id,
    name: input.name || "Untitled widget",
  });
  const folderId = definitionFolder.id;

  const sourceFile = await createWidgetSourceFile({
    store,
    folderId,
    code: input.widgetCode,
  });

  await createWidgetManifestFile({
    store,
    folderId,
    manifest: buildWidgetManifest({
      kind: "generated",
      name: input.name,
      dataSourceName: input.dataSourceName,
      dataSourceParams: input.dataSourceParams,
      dataFiles: input.dataFiles,
    }),
  });

  createWidgetDefinition({
    store,
    input: {
      id: input.id,
      kind: "generated",
      name: input.name,
      dataSourceName: input.dataSourceName,
      dataSourceParams: input.dataSourceParams,
      folderId,
      sourceFileId: sourceFile.id,
    },
  });

  return { ok: true };
};
