import { fileEvents, type file as LiveStoreFile } from "@/livestore/file";
import { folderEvents, type folder as LiveStoreFolder } from "@/livestore/folder";
import {
  widgetEvents,
  type BuiltinWidgetKey,
  type DataSourceName,
  type WidgetKind,
  type widgetDefinition,
  type widgetInstance,
} from "@/livestore/widget";
import { collectFolderDescendants } from "@/lib/tree/folderTree";
import { parseJsonRecord } from "./widgetJson";
import { buildWidgetManifest } from "./widgetManifest";
import {
  findWidgetManifestFile,
  readWidgetManifestFile,
  rewriteWidgetManifestFile,
} from "./widgetManifestFile";

export interface WidgetDefinitionStoreLike {
  commit: (...events: unknown[]) => void;
}

export interface CreateWidgetDefinitionInput {
  id: string;
  kind: WidgetKind;
  name: string;
  widgetCode?: string;
  builtinKey?: BuiltinWidgetKey;
  dataSourceName?: DataSourceName | null;
  dataSourceParams?: Record<string, unknown>;
  folderId?: string | null;
  sourceFileId?: string | null;
}

export const createWidgetDefinition = ({
  store,
  input,
}: {
  store: WidgetDefinitionStoreLike;
  input: CreateWidgetDefinitionInput;
}): void => {
  store.commit(
    widgetEvents.widgetDefinitionCreated({
      id: input.id,
      kind: input.kind,
      builtinKey: input.builtinKey,
      name: input.name,
      widgetCode: input.widgetCode,
      dataSourceName: input.dataSourceName ?? undefined,
      dataSourceParams: JSON.stringify(input.dataSourceParams ?? {}),
      folderId: input.folderId ?? undefined,
      sourceFileId: input.sourceFileId ?? undefined,
      createdAt: new Date(),
    }),
  );
};

export interface UpdateWidgetDefinitionInput {
  id: string;
  name?: string;
  // null clears the binding; undefined leaves whatever the row already has.
  dataSourceName?: DataSourceName | null;
  dataSourceParams?: Record<string, unknown>;
  // Backfills the folder/source-file binding onto a row that predates it (the legacy migration
  // in seedHomeGrid.ts) — a plain rename never sets these.
  folderId?: string;
  sourceFileId?: string;
}

export const updateWidgetDefinition = ({
  store,
  input,
  definition,
  files = [],
}: {
  store: WidgetDefinitionStoreLike;
  input: UpdateWidgetDefinitionInput;
  // The Definition's row as it stood before this update. Only needed when renaming: it carries
  // the folderId (and the other manifest fields) this function needs to keep the folder and
  // widget.json named to match. Renaming a Definition's *folder* on the Desktop goes through
  // `syncWidgetDefinitionFolderRename` instead, which already has the folder's new name and
  // does not loop back through here.
  definition?: widgetDefinition;
  files?: readonly LiveStoreFile[];
}): void => {
  const updatedAt = new Date();
  store.commit(
    widgetEvents.widgetDefinitionUpdated({
      id: input.id,
      name: input.name,
      dataSourceName: input.dataSourceName,
      dataSourceParams:
        input.dataSourceParams !== undefined ? JSON.stringify(input.dataSourceParams) : undefined,
      folderId: input.folderId,
      sourceFileId: input.sourceFileId,
      updatedAt,
    }),
  );

  const name = input.name;
  if (name === undefined || !definition || !definition.folderId || definition.name === name) {
    return;
  }

  store.commit(
    folderEvents.folderUpdated({
      id: definition.folderId,
      name,
      updatedAt,
    }),
  );

  const manifestFile = findWidgetManifestFile(files, definition.folderId);
  if (!manifestFile) {
    return;
  }

  // dataFiles (ADR 0008) lives only in widget.json, not on the table — read the old manifest
  // first so a rename doesn't wipe out the Definition's data-file declaration.
  void readWidgetManifestFile(manifestFile)
    .then((previousManifest) =>
      rewriteWidgetManifestFile({
        store,
        manifestFile,
        manifest: buildWidgetManifest({
          kind: definition.kind,
          builtinKey: definition.builtinKey,
          name,
          dataSourceName:
            input.dataSourceName !== undefined ? input.dataSourceName : definition.dataSourceName,
          dataSourceParams:
            input.dataSourceParams ?? parseWidgetDefinitionDataSourceParams(definition),
          dataFiles: previousManifest?.dataFiles,
        }),
      }),
    )
    .catch((error: unknown) => {
      console.error("Failed to rewrite widget.json after rename:", error);
    });
};

export interface DeleteWidgetDefinitionInput {
  id: string;
  // When set, cascades the delete to the Definition's folder, that folder's files, and any
  // Instances still pointing at this Definition.
  folderId?: string | null;
  folders?: readonly LiveStoreFolder[];
  files?: readonly LiveStoreFile[];
  instances?: readonly widgetInstance[];
}

export const deleteWidgetDefinition = ({
  store,
  id,
  folderId = null,
  folders = [],
  files = [],
  instances = [],
}: {
  store: WidgetDefinitionStoreLike;
} & DeleteWidgetDefinitionInput): void => {
  const deletedAt = new Date();
  store.commit(widgetEvents.widgetDefinitionDeleted({ id, deletedAt }));

  instances
    .filter((instance) => instance.definitionId === id && !instance.deletedAt)
    .forEach((instance) => {
      store.commit(widgetEvents.widgetInstanceDeleted({ id: instance.id, deletedAt }));
    });

  if (!folderId) {
    return;
  }

  const descendants = collectFolderDescendants(folderId, folders, files);
  descendants.files.forEach((file) => {
    store.commit(fileEvents.fileDeleted({ id: file.id, deletedAt }));
  });
  descendants.folders.forEach((folder) => {
    store.commit(folderEvents.folderDeleted({ id: folder.id, deletedAt }));
  });
};

export const parseWidgetDefinitionDataSourceParams = (
  row: Pick<widgetDefinition, "dataSourceParams">,
): Record<string, unknown> => parseJsonRecord(row.dataSourceParams);
