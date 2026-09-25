import type { Queryable } from "@livestore/livestore";
import { file as opfsFile } from "@memora/fs";

import { activeFilesQuery$ } from "@/lib/library/queries";
import { desktopFilesQuery$ } from "@/lib/desktop/queries";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import { findTodoDocument } from "@/components/dashboard/todoDocument";
import { parseTodoMarkdown } from "@/components/dashboard/todoMarkdown";
import { listChatSessions } from "@/lib/chat/chatSessionStorage";
import { DATA_SOURCE_NAMES, type DataSourceName } from "@/livestore/widget";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import { findWidgetDataFolder, widgetFoldersQuery$ } from "./widgetFolders";
import type { WidgetQueryableStore } from "./widgetStore";

export { DATA_SOURCE_NAMES, type DataSourceName };

const DEFAULT_RECENT_FILES_LIMIT = 5;

// A single field type today (whole-number counts); add "text"/"boolean" here if a future
// catalog entry needs them, and extend DataSourceParamsFields to render the new type.
export interface DataSourceParamField {
  key: string;
  label: string;
  type: "number";
  min?: number;
  step?: number;
  defaultValue: number;
}

export interface DataSourceCatalogEntry {
  name: DataSourceName;
  label: string;
  description: string;
  params?: readonly DataSourceParamField[];
}

export const DATA_SOURCE_CATALOG: readonly DataSourceCatalogEntry[] = [
  {
    name: "recentFiles",
    label: "Recent files",
    description: "Recently updated items in your library.",
    params: [
      {
        key: "limit",
        label: "Files to show",
        type: "number",
        min: 1,
        step: 1,
        defaultValue: DEFAULT_RECENT_FILES_LIMIT,
      },
    ],
  },
  {
    name: "todoProgress",
    label: "To-do progress",
    description: "Completed and open tasks in your to-do document.",
  },
  { name: "storageStats", label: "Storage", description: "Local storage usage and availability." },
  {
    name: "chatSessionCount",
    label: "Chat sessions",
    description: "The number of saved conversations.",
  },
  {
    name: "widgetData",
    label: "Widget's own data",
    description:
      "The widget's own files written with writeData(name, content), keyed by file name.",
  },
];

export const getDataSourceCatalogEntry = (
  name: string | null | undefined,
): DataSourceCatalogEntry | undefined => {
  return DATA_SOURCE_CATALOG.find((entry) => entry.name === name);
};

// The three functions below let both the save dialog and the add dialog render, edit, and
// validate a catalog entry's params from its schema alone, instead of hand-rolling a field per
// data source. Form state is kept as strings (native input values); these convert at the edges.
export const getDefaultDataSourceParams = (
  entry: DataSourceCatalogEntry | undefined,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const field of entry?.params ?? []) {
    result[field.key] = field.defaultValue;
  }
  return result;
};

export const stringifyDataSourceParamValues = (
  entry: DataSourceCatalogEntry | undefined,
  values: Record<string, unknown>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const field of entry?.params ?? []) {
    const raw = values[field.key];
    result[field.key] = typeof raw === "number" ? String(raw) : String(field.defaultValue);
  }
  return result;
};

export const parseDataSourceParamValues = (
  entry: DataSourceCatalogEntry | undefined,
  stringValues: Record<string, string>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const field of entry?.params ?? []) {
    result[field.key] = Number(stringValues[field.key]);
  }
  return result;
};

export const validateDataSourceParamValues = (
  entry: DataSourceCatalogEntry | undefined,
  stringValues: Record<string, string>,
): string | null => {
  for (const field of entry?.params ?? []) {
    const value = Number(stringValues[field.key]);
    if (!Number.isInteger(value) || (field.min !== undefined && value < field.min)) {
      return `Enter a whole number for ${field.label.toLowerCase()}.`;
    }
  }
  return null;
};

// Sources backed by a livestore query re-resolve on data change; storageStats and chatSessionCount
// read external browser/OPFS state with no change event to subscribe to, so useDataSourceValue
// polls those instead (see DATA_SOURCE_POLL_INTERVAL_MS).
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Queryable's TResult varies per
// entry; `any` here matches how the library itself types heterogeneous query maps.
export const DATA_SOURCE_LIVE_QUERIES: Partial<Record<DataSourceName, Queryable<any>>> = {
  recentFiles: desktopFilesQuery$,
  todoProgress: activeFilesQuery$,
  // Re-resolves on every file-table change (not just this Definition's data/ folder) — coarse,
  // but simplest, and file writes are rare enough that the extra re-resolutions are cheap.
  widgetData: activeFilesQuery$,
};

export interface RecentFilesData {
  files: Array<{ id: string; name: string; type: string; updatedAt: number }>;
}

export interface TodoProgressData {
  total: number;
  completed: number;
}

export interface StorageStatsData {
  usedBytes: number;
  quotaBytes: number;
  isPersistent: boolean;
  isSupported: boolean;
}

export interface ChatSessionCountData {
  count: number;
}

type DataSourceResolver = (store: WidgetQueryableStore, params: unknown) => unknown;

const resolveRecentFiles: DataSourceResolver = (store, params) => {
  const requestedLimit = (params as { limit?: unknown } | null)?.limit;
  const limit =
    typeof requestedLimit === "number" && requestedLimit > 0
      ? requestedLimit
      : DEFAULT_RECENT_FILES_LIMIT;
  const rows = store.query(desktopFilesQuery$) as readonly LiveStoreFile[];

  const data: RecentFilesData = {
    files: rows.slice(0, limit).map((row) => {
      const meta = mapLiveStoreFileToMeta(row);
      return { id: meta.id, name: meta.name, type: meta.type, updatedAt: meta.updatedAt };
    }),
  };
  return data;
};

const resolveTodoProgress: DataSourceResolver = async (store) => {
  const rows = store.query(activeFilesQuery$) as readonly LiveStoreFile[];
  const todoFile = findTodoDocument(rows.map(mapLiveStoreFileToMeta));

  if (!todoFile) {
    const empty: TodoProgressData = { total: 0, completed: 0 };
    return empty;
  }

  const markdown = await opfsFile(todoFile.storagePath).text();
  const tasks = parseTodoMarkdown(markdown);
  const data: TodoProgressData = {
    total: tasks.length,
    completed: tasks.filter((task) => task.done).length,
  };
  return data;
};

const resolveStorageStats: DataSourceResolver = async () => {
  if (!navigator.storage?.estimate) {
    const unsupported: StorageStatsData = {
      usedBytes: 0,
      quotaBytes: 0,
      isPersistent: false,
      isSupported: false,
    };
    return unsupported;
  }

  const estimate = await navigator.storage.estimate();
  const isPersistent = (await navigator.storage.persisted?.()) ?? false;
  const data: StorageStatsData = {
    usedBytes: Math.max(0, estimate.usage ?? 0),
    quotaBytes: Math.max(0, estimate.quota ?? 0),
    isPersistent,
    isSupported: true,
  };
  return data;
};

const resolveChatSessionCount: DataSourceResolver = async () => {
  const sessions = await listChatSessions();
  const data: ChatSessionCountData = { count: sessions.length };
  return data;
};

// Reads back whatever the Definition has written to its own data/ folder via writeData (see ADR
// 0008), keyed by file name — JSON-parsed when the content is valid JSON, raw text otherwise.
// Needs folderId injected into params by the caller (resolveWidgetInstanceParams does this for
// definitions bound to this source); with no folderId there is nothing to read yet.
const resolveWidgetData: DataSourceResolver = async (store, params) => {
  const folderId = (params as { folderId?: unknown } | null)?.folderId;
  if (typeof folderId !== "string" || !folderId) {
    return {};
  }

  const folders = store.query(widgetFoldersQuery$) as readonly LiveStoreFolder[];
  const dataFolder = findWidgetDataFolder(folders, folderId);
  if (!dataFolder) {
    return {};
  }

  const files = store.query(activeFilesQuery$) as readonly LiveStoreFile[];
  const dataFiles = files.filter((file) => file.parentId === dataFolder.id && !file.deletedAt);

  const result: Record<string, unknown> = {};
  for (const file of dataFiles) {
    const meta = mapLiveStoreFileToMeta(file);
    try {
      const text = await opfsFile(meta.storagePath).text();
      try {
        result[file.name] = JSON.parse(text);
      } catch {
        result[file.name] = text;
      }
    } catch {
      // Skip a file that can't be read rather than failing the whole resolution.
    }
  }
  return result;
};

const dataSourceResolvers: Record<DataSourceName, DataSourceResolver> = {
  recentFiles: resolveRecentFiles,
  todoProgress: resolveTodoProgress,
  storageStats: resolveStorageStats,
  chatSessionCount: resolveChatSessionCount,
  widgetData: resolveWidgetData,
};

export const resolveDataSource = async (
  name: DataSourceName,
  store: WidgetQueryableStore,
  params: unknown = {},
): Promise<unknown> => {
  const resolver = dataSourceResolvers[name];
  if (!resolver) {
    throw new Error(`Unknown data source "${name}"`);
  }
  return resolver(store, params);
};
