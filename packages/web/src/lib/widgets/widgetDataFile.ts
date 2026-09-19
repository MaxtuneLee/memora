import { activeFilesQuery$ } from "@/lib/library/queries";
import { saveFileToOpfs } from "@/lib/library/fileStorage";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";

import {
  createWidgetDataFolder,
  findWidgetDataFolder,
  widgetFoldersQuery$,
  type WidgetFolderStoreLike,
} from "./widgetFolders";
import {
  commitFileCreated,
  findWidgetManifestFile,
  overwriteFileContentInOpfs,
  readWidgetManifestFile,
  type WidgetFileStoreLike,
} from "./widgetManifestFile";
import type { WidgetQueryableStore } from "./widgetStore";

// Per-file and per-Definition caps are host-enforced constants, not author-configurable — only
// the set of allowed file names is declared in widget.json (see ADR 0008).
export const WIDGET_DATA_MAX_FILE_BYTES = 64 * 1024;
export const WIDGET_DATA_MAX_TOTAL_BYTES = 512 * 1024;

export type WriteWidgetDataResult = { ok: true } | { ok: false; error: string };

const mimeTypeForDataFileName = (name: string): string =>
  name.endsWith(".json") ? "application/json" : "text/plain";

// Pure so both the host (OPFS-backed) write path and Chat's in-memory preview path can share the
// same declared-names/size-cap rules without duplicating them.
export const validateWidgetDataWrite = ({
  name,
  content,
  allowedNames,
  existingSizesByName,
}: {
  name: string;
  content: string;
  // null means "no declaration at all" — every write is refused, per ADR 0008.
  allowedNames: readonly string[] | null;
  // Sizes (bytes) of this Definition's other already-written data files, keyed by name —
  // excludes `name` itself so overwriting a file doesn't double-count it against the total cap.
  existingSizesByName: Record<string, number>;
}): WriteWidgetDataResult & { byteLength?: number } => {
  if (!name.trim()) {
    return { ok: false, error: "Data file name must not be empty." };
  }

  if (!allowedNames || !allowedNames.includes(name)) {
    return { ok: false, error: `"${name}" is not a declared data file for this widget.` };
  }

  const byteLength = new Blob([content]).size;
  if (byteLength > WIDGET_DATA_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `"${name}" exceeds the ${WIDGET_DATA_MAX_FILE_BYTES}-byte limit.`,
    };
  }

  const otherBytes = Object.entries(existingSizesByName)
    .filter(([existingName]) => existingName !== name)
    .reduce((sum, [, size]) => sum + size, 0);
  if (otherBytes + byteLength > WIDGET_DATA_MAX_TOTAL_BYTES) {
    return { ok: false, error: "This widget's data storage limit is full." };
  }

  return { ok: true, byteLength };
};

export interface WidgetDataFileStore
  extends WidgetFileStoreLike, WidgetFolderStoreLike, WidgetQueryableStore {}

// Serializes writes per Definition (see ADR 0008's "rate limit writes per Instance"): the Home
// Grid shim only coalesces same-name writeData calls, so two different file names can still
// reach the host in the same tick. Without this, both would query folders/files before either
// had committed, each conclude the data/ folder doesn't exist yet, and each create one —
// splitting the Definition's files across two folders and silently dropping some of them from
// later widgetData reads. Queuing by definitionFolderId means each write re-queries live state
// only after every earlier write for that Definition has fully committed.
const writeQueueByDefinitionFolderId = new Map<string, Promise<WriteWidgetDataResult>>();

const enqueueWidgetDataWrite = (
  definitionFolderId: string,
  task: () => Promise<WriteWidgetDataResult>,
): Promise<WriteWidgetDataResult> => {
  const previous = writeQueueByDefinitionFolderId.get(definitionFolderId) ?? Promise.resolve();
  const settled = previous.then(task, task);
  const tracked = settled.catch(() => ({ ok: false, error: "Write failed." }) as const);
  writeQueueByDefinitionFolderId.set(definitionFolderId, tracked);
  void tracked.finally(() => {
    if (writeQueueByDefinitionFolderId.get(definitionFolderId) === tracked) {
      writeQueueByDefinitionFolderId.delete(definitionFolderId);
    }
  });
  return settled;
};

// Host-side entry point for a writeData(name, content) call: reads the Definition's own
// widget.json for its declared file names, finds (or creates) its data/ folder, validates
// against the shared rules above, and writes through the same OPFS + fileEvents path every other
// Desktop file uses — so the result shows up on the Desktop, in search, and to chat like any
// other file (ADR 0008).
export const writeWidgetDataFile = ({
  store,
  definitionFolderId,
  name,
  content,
}: {
  store: WidgetDataFileStore;
  definitionFolderId: string;
  name: string;
  content: string;
}): Promise<WriteWidgetDataResult> =>
  enqueueWidgetDataWrite(definitionFolderId, () =>
    performWidgetDataWrite({ store, definitionFolderId, name, content }),
  );

const performWidgetDataWrite = async ({
  store,
  definitionFolderId,
  name,
  content,
}: {
  store: WidgetDataFileStore;
  definitionFolderId: string;
  name: string;
  content: string;
}): Promise<WriteWidgetDataResult> => {
  const folders = store.query(widgetFoldersQuery$) as readonly LiveStoreFolder[];
  const files = store.query(activeFilesQuery$) as readonly LiveStoreFile[];

  const manifestFile = findWidgetManifestFile(files, definitionFolderId);
  const manifest = manifestFile ? await readWidgetManifestFile(manifestFile) : null;
  // readWidgetManifestFile only checks that widget.json parsed to an object, not its shape — a
  // hand-edited or corrupted file could have a non-array dataFiles, which would otherwise reach
  // validateWidgetDataWrite's allowedNames.includes(name) as something other than an array.
  const allowedNames = Array.isArray(manifest?.dataFiles) ? manifest.dataFiles : null;

  const existingDataFolder = findWidgetDataFolder(folders, definitionFolderId);
  const existingDataFiles = existingDataFolder
    ? files.filter((file) => file.parentId === existingDataFolder.id && !file.deletedAt)
    : [];
  const existingSizesByName = Object.fromEntries(
    existingDataFiles.map((file) => [file.name, file.sizeBytes]),
  );

  const validation = validateWidgetDataWrite({
    name,
    content,
    allowedNames,
    existingSizesByName,
  });
  if (!validation.ok) {
    return validation;
  }

  // Only create the data/ folder once a write actually passes validation — a refused write (bad
  // name, over cap, no declaration) should never leave a stray empty folder behind.
  const dataFolder =
    existingDataFolder ?? createWidgetDataFolder({ store, definitionFolderId }).folder;
  const existingFile = existingDataFiles.find((file) => file.name === name);
  if (existingFile) {
    await overwriteFileContentInOpfs({ store, file: existingFile, content });
    return { ok: true };
  }

  const result = await saveFileToOpfs({
    blob: new Blob([content], { type: mimeTypeForDataFileName(name) }),
    name,
    type: "document",
    mimeType: mimeTypeForDataFileName(name),
    parentId: dataFolder.id,
  });
  commitFileCreated(store, result.meta);
  return { ok: true };
};
