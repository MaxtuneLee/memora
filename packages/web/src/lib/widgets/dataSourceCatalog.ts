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
import type { WidgetQueryableStore } from "./widgetStore";

export { DATA_SOURCE_NAMES, type DataSourceName };

export interface DataSourceCatalogEntry {
  name: DataSourceName;
  label: string;
  description: string;
}

export const DATA_SOURCE_CATALOG: readonly DataSourceCatalogEntry[] = [
  {
    name: "recentFiles",
    label: "Recent files",
    description: "Recently updated items in your library.",
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
];

export const getDataSourceCatalogEntry = (name: string): DataSourceCatalogEntry | undefined => {
  return DATA_SOURCE_CATALOG.find((entry) => entry.name === name);
};

// ponytail: only sources backed by a livestore query re-resolve on data change; storageStats and
// chatSessionCount read external browser/OPFS state and only refresh on mount. Add a query here if
// those need live updates too.
export const DATA_SOURCE_LIVE_QUERIES: Partial<Record<DataSourceName, Queryable<any>>> = {
  recentFiles: desktopFilesQuery$,
  todoProgress: activeFilesQuery$,
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

const DEFAULT_RECENT_FILES_LIMIT = 5;

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

const dataSourceResolvers: Record<DataSourceName, DataSourceResolver> = {
  recentFiles: resolveRecentFiles,
  todoProgress: resolveTodoProgress,
  storageStats: resolveStorageStats,
  chatSessionCount: resolveChatSessionCount,
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
