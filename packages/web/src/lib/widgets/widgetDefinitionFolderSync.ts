import type { file as LiveStoreFile } from "@/livestore/file";
import type { widgetDefinition } from "@/livestore/widget";

import {
  parseWidgetDefinitionDataSourceParams,
  updateWidgetDefinition,
  type WidgetDefinitionStoreLike,
} from "./widgetDefinitions";
import { buildWidgetManifest } from "./widgetManifest";
import {
  findWidgetManifestFile,
  rewriteWidgetManifestFile,
  type WidgetFileStoreLike,
} from "./widgetManifestFile";

// The Desktop's folder-rename path (Desktop.tsx's handleRenameCommit) already commits the
// folder's own rename before calling this. This only syncs the matching Definition's name (and
// rewrites its widget.json to match), so the folder and the Definition never show two different
// names for the same thing. The reverse direction — renaming a Definition renaming its folder —
// lives in updateWidgetDefinition itself.
export const syncWidgetDefinitionFolderRename = ({
  store,
  definitions,
  files,
  folderId,
  name,
}: {
  store: WidgetDefinitionStoreLike & WidgetFileStoreLike;
  definitions: readonly widgetDefinition[];
  files: readonly LiveStoreFile[];
  folderId: string;
  name: string;
}): void => {
  const definition = definitions.find((row) => row.folderId === folderId && !row.deletedAt);
  if (!definition || definition.name === name) {
    return;
  }

  updateWidgetDefinition({ store, input: { id: definition.id, name } });

  const manifestFile = findWidgetManifestFile(files, folderId);
  if (!manifestFile) {
    return;
  }

  void rewriteWidgetManifestFile({
    store,
    manifestFile,
    manifest: buildWidgetManifest({
      kind: definition.kind,
      builtinKey: definition.builtinKey,
      name,
      dataSourceName: definition.dataSourceName,
      dataSourceParams: parseWidgetDefinitionDataSourceParams(definition),
    }),
  }).catch((error: unknown) => {
    console.error("Failed to rewrite widget.json after rename:", error);
  });
};
