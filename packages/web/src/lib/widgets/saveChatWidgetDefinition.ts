import { desktopFilesQuery$ } from "@/lib/desktop/queries";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { DataSourceName, widgetDefinition } from "@/livestore/widget";

import {
  createWidgetDefinition,
  updateWidgetDefinition,
  type WidgetDefinitionStoreLike,
} from "./widgetDefinitions";
import {
  createWidgetDefinitionFolder,
  ensureWidgetsRootFolder,
  widgetFoldersQuery$,
  type WidgetFolderStoreLike,
} from "./widgetFolders";
import { buildWidgetManifest } from "./widgetManifest";
import { createWidgetManifestFile, createWidgetSourceFile } from "./widgetManifestFile";
import { activeWidgetDefinitionsQuery$ } from "./widgetQueries";
import type { WidgetQueryableStore } from "./widgetStore";

export interface SaveChatWidgetDefinitionInput {
  id: string;
  name: string;
  widgetCode: string;
  // Optional: a widget with no persistent state needs no catalog binding at all.
  dataSourceName?: DataSourceName;
  dataSourceParams?: Record<string, unknown>;
  // File names this Definition may write via writeData once saved (see ADR 0008).
  dataFiles?: string[];
  // The id of a Definition this same chat widget preview already saved earlier — set by the
  // caller (ChatWidget tracks it per toolCallId) so re-clicking Save updates that Definition's
  // binding instead of creating a duplicate for every click.
  existingDefinitionId?: string;
}

export type SaveChatWidgetDefinitionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "missing-widget-code" };

export interface SaveChatWidgetDefinitionStore
  extends WidgetDefinitionStoreLike, WidgetFolderStoreLike, WidgetQueryableStore {}

export const saveChatWidgetDefinition = async ({
  store,
  input,
}: {
  store: SaveChatWidgetDefinitionStore;
  input: SaveChatWidgetDefinitionInput;
}): Promise<SaveChatWidgetDefinitionResult> => {
  if (!input.widgetCode.trim()) {
    return { ok: false, reason: "missing-widget-code" };
  }

  if (input.existingDefinitionId) {
    const definitions = store.query(activeWidgetDefinitionsQuery$) as readonly widgetDefinition[];
    const existing = definitions.find((definition) => definition.id === input.existingDefinitionId);
    if (existing) {
      const files = store.query(desktopFilesQuery$) as readonly LiveStoreFile[];
      updateWidgetDefinition({
        store,
        input: {
          id: existing.id,
          name: input.name,
          dataSourceName: input.dataSourceName ?? null,
          dataSourceParams: input.dataSourceParams,
        },
        definition: existing,
        files,
      });
      return { ok: true, id: existing.id };
    }
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

  return { ok: true, id: input.id };
};
