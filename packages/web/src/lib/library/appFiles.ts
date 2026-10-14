import { isAppLogFile } from "@/lib/appLog/appLogCollector";
import { WIDGET_MANIFEST_FILE_NAME, WIDGET_SOURCE_FILE_NAME } from "@/lib/widgets/widgetManifest";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";

type FileRef = { name: string; parentId?: string | null };
type FolderRef = Pick<LiveStoreFolder, "id" | "reservedKind">;

// The debug log and the widget code inside widget definition folders are app files: they stay
// out of the search index and recent files.
export const isAppFile = (
  file: Pick<LiveStoreFile, "name" | "parentId"> | FileRef,
  parent: Pick<LiveStoreFolder, "reservedKind"> | null | undefined,
): boolean =>
  isAppLogFile({ name: file.name, parentId: file.parentId ?? null }) ||
  (parent?.reservedKind === "widgetDefinition" &&
    (file.name === WIDGET_MANIFEST_FILE_NAME || file.name === WIDGET_SOURCE_FILE_NAME));

export const withoutAppFiles = <T extends FileRef>(
  files: readonly T[],
  folders: readonly FolderRef[],
): T[] => {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  return files.filter(
    (file) => !isAppFile(file, file.parentId ? foldersById.get(file.parentId) : null),
  );
};
