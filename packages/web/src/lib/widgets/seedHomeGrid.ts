import { TODO_DOCUMENT_NAME } from "@/components/dashboard/todoMarkdown";
import { activeFilesQuery$ } from "@/lib/library/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { fileEvents, type file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import { settingEvents, type setting } from "@/livestore/setting";
import {
  BUILTIN_WIDGET_KEYS,
  type BuiltinWidgetKey,
  type DataSourceName,
  type widgetDefinition,
} from "@/livestore/widget";
import { createWidgetDefinition, updateWidgetDefinition } from "./widgetDefinitions";
import { createWidgetInstance } from "./widgetInstances";
import {
  createWidgetDefinitionFolder,
  ensureWidgetsRootFolder,
  findWidgetsRootFolder,
  widgetFoldersQuery$,
  type WidgetFolderStoreLike,
} from "./widgetFolders";
import { buildWidgetManifest } from "./widgetManifest";
import { createWidgetManifestFile } from "./widgetManifestFile";
import { activeWidgetDefinitionsQuery$ } from "./widgetQueries";
import type { WidgetQueryableStore } from "./widgetStore";

interface SeedHomeGridStore extends WidgetQueryableStore, WidgetFolderStoreLike {
  commit: (...events: unknown[]) => void;
}

export interface LegacyWidgetVisibility {
  calendar?: boolean;
  todo?: boolean;
  recent?: boolean;
}

const LEGACY_WIDGET_VISIBILITY_STORAGE_KEY = "memora:dashboard:widgets";

const BUILTIN_WIDGET_NAMES: Record<BuiltinWidgetKey, string> = {
  calendar: "Calendar",
  todo: "Todo",
  recent: "Recent",
};

const BUILTIN_WIDGET_DATA_SOURCES: Record<BuiltinWidgetKey, DataSourceName> = {
  calendar: "recentFiles",
  todo: "todoProgress",
  recent: "recentFiles",
};

export const readLegacyWidgetVisibility = (): LegacyWidgetVisibility => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_WIDGET_VISIBILITY_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LegacyWidgetVisibility) : {};
  } catch {
    return {};
  }
};

export const builtinWidgetDefinitionId = (key: BuiltinWidgetKey): string => `builtin:${key}`;

// A root Today Tasks document predates Widget Definitions living in folders; move it into
// Widgets/Todo/ the first time we see it, instead of leaving an orphaned root file behind.
const migrateRootTodoDocument = ({
  store,
  files,
  todoFolderId,
}: {
  store: SeedHomeGridStore;
  files: readonly LiveStoreFile[];
  todoFolderId: string;
}): void => {
  const rootTodoDocument = files.find(
    (file) =>
      file.type === "document" &&
      file.name === TODO_DOCUMENT_NAME &&
      (file.parentId ?? null) === null &&
      !file.deletedAt,
  );
  if (!rootTodoDocument) {
    return;
  }

  store.commit(
    fileEvents.fileUpdated({
      id: rootTodoDocument.id,
      parentId: todoFolderId,
      updatedAt: new Date(),
    }),
  );
};

// Creates one definition folder + widget.json per builtin key, and returns the folder id for
// each so the caller can create or link the matching widgetDefinition row.
const seedBuiltinDefinitionFolders = async ({
  store,
  folders,
  rootId,
  namesByKey,
}: {
  store: SeedHomeGridStore;
  folders: readonly LiveStoreFolder[];
  rootId: string;
  namesByKey: Record<BuiltinWidgetKey, string>;
}): Promise<Record<BuiltinWidgetKey, string>> => {
  let knownFolders = folders;
  const folderIdsByKey = {} as Record<BuiltinWidgetKey, string>;

  for (const key of BUILTIN_WIDGET_KEYS) {
    const { folder } = createWidgetDefinitionFolder({
      store,
      folders: knownFolders,
      rootId,
      name: namesByKey[key],
    });
    knownFolders = [...knownFolders, folder];
    folderIdsByKey[key] = folder.id;

    await createWidgetManifestFile({
      store,
      folderId: folder.id,
      manifest: buildWidgetManifest({
        kind: "builtin",
        builtinKey: key,
        name: namesByKey[key],
        dataSourceName: BUILTIN_WIDGET_DATA_SOURCES[key],
      }),
    });
  }

  return folderIdsByKey;
};

// Keyed by store identity: DashboardPage calls seedHomeGrid from a useEffect, which React
// StrictMode invokes twice in development. Both calls happen before the first has had a chance
// to await its OPFS writes and commit homeGridSeeded / widgetFoldersSeeded, so without this guard
// a second concurrent call sees the same "not seeded yet" state and duplicates every definition
// folder (with a numeric suffix) and every builtin:* Definition. Mirrors the in-flight-promise
// pattern todoDocument.ts uses for concurrent Todo-document creation.
const inFlightSeeds = new WeakMap<SeedHomeGridStore, Promise<void>>();

export const seedHomeGrid = async ({
  store,
  legacyVisibility = readLegacyWidgetVisibility(),
}: {
  store: SeedHomeGridStore;
  legacyVisibility?: LegacyWidgetVisibility;
}): Promise<void> => {
  const existing = inFlightSeeds.get(store);
  if (existing) {
    return existing;
  }

  const run = seedHomeGridOnce({ store, legacyVisibility }).finally(() => {
    if (inFlightSeeds.get(store) === run) {
      inFlightSeeds.delete(store);
    }
  });
  inFlightSeeds.set(store, run);
  return run;
};

const seedHomeGridOnce = async ({
  store,
  legacyVisibility,
}: {
  store: SeedHomeGridStore;
  legacyVisibility: LegacyWidgetVisibility;
}): Promise<void> => {
  const settings = store.query(settingsDocumentQuery$) as Partial<setting> | undefined;
  const folders = store.query(widgetFoldersQuery$) as readonly LiveStoreFolder[];

  if (!settings?.homeGridSeeded) {
    const { folder: rootFolder } = ensureWidgetsRootFolder({ store, folders });
    const foldersWithRoot = findWidgetsRootFolder(folders) ? folders : [...folders, rootFolder];
    const folderIdsByKey = await seedBuiltinDefinitionFolders({
      store,
      folders: foldersWithRoot,
      rootId: rootFolder.id,
      namesByKey: BUILTIN_WIDGET_NAMES,
    });

    let sortOrder = 0;
    for (const key of BUILTIN_WIDGET_KEYS) {
      const definitionId = builtinWidgetDefinitionId(key);

      createWidgetDefinition({
        store,
        input: {
          id: definitionId,
          kind: "builtin",
          builtinKey: key,
          name: BUILTIN_WIDGET_NAMES[key],
          dataSourceName: BUILTIN_WIDGET_DATA_SOURCES[key],
          folderId: folderIdsByKey[key],
        },
      });

      if (legacyVisibility[key] === false) {
        continue;
      }

      createWidgetInstance({
        store,
        input: {
          id: crypto.randomUUID(),
          definitionId,
          sortOrder: sortOrder++,
        },
      });
    }

    const files = store.query(activeFilesQuery$) as readonly LiveStoreFile[];
    migrateRootTodoDocument({ store, files, todoFolderId: folderIdsByKey.todo });

    store.commit(settingEvents.settingsSet({ homeGridSeeded: true, widgetFoldersSeeded: true }));
    return;
  }

  if (settings?.widgetFoldersSeeded) {
    return;
  }

  // Legacy install: builtin Definitions already exist (homeGridSeeded is true) but predate the
  // folder layout — back-fill the Widgets root and one folder per builtin Definition, without
  // touching Instances or visibility. Existing folders are matched by name (there's no other key
  // to go on before the row is backfilled); once matched, each Definition's folderId is patched
  // to point at it, so later reads (e.g. TodoPanel's todoFolderId) resolve without another
  // name-based lookup.
  const existingDefinitions = store.query(
    activeWidgetDefinitionsQuery$,
  ) as readonly widgetDefinition[];
  const { folder: rootFolder } = ensureWidgetsRootFolder({ store, folders });
  let knownFolders = findWidgetsRootFolder(folders) ? folders : [...folders, rootFolder];
  let todoFolderId: string | null = null;

  for (const key of BUILTIN_WIDGET_KEYS) {
    const definitionId = builtinWidgetDefinitionId(key);
    const definition = existingDefinitions.find((row) => row.id === definitionId);
    if (!definition) {
      continue;
    }

    const desiredName = definition.name || BUILTIN_WIDGET_NAMES[key];
    const existingFolder = knownFolders.find(
      (folder) =>
        folder.reservedKind === "widgetDefinition" &&
        folder.parentId === rootFolder.id &&
        folder.name === desiredName,
    );

    let folderId: string;
    if (existingFolder) {
      folderId = existingFolder.id;
    } else {
      const { folder } = createWidgetDefinitionFolder({
        store,
        folders: knownFolders,
        rootId: rootFolder.id,
        name: desiredName,
      });
      knownFolders = [...knownFolders, folder];
      folderId = folder.id;

      await createWidgetManifestFile({
        store,
        folderId,
        manifest: buildWidgetManifest({
          kind: "builtin",
          builtinKey: key,
          name: desiredName,
          dataSourceName: definition.dataSourceName,
        }),
      });
    }

    if (definition.folderId !== folderId) {
      updateWidgetDefinition({ store, input: { id: definitionId, folderId } });
    }

    if (key === "todo") {
      todoFolderId = folderId;
    }
  }

  if (todoFolderId) {
    const files = store.query(activeFilesQuery$) as readonly LiveStoreFile[];
    migrateRootTodoDocument({ store, files, todoFolderId });
  }

  store.commit(settingEvents.settingsSet({ widgetFoldersSeeded: true }));
};
