import { queryDb } from "@livestore/livestore";
import { useStore } from "@livestore/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { modelWorkerFactory } from "@/lib/model-worker";
import { BackgroundTaskQueue, createBackgroundTaskQueue } from "@/lib/background-tasks";
import { fileTable, type file as LiveStoreFile } from "@/livestore/file";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeSettingsValue, settingsTable, type setting } from "@/livestore/setting";

const contentPipelineFilesQuery$ = queryDb(
  () => fileTable.where({ deletedAt: null, purgedAt: null }).orderBy("updatedAt", "desc"),
  { label: "content-pipeline:files" },
);
import { createContentTaskHandlers } from "./contentTaskHandlers";

interface ContentPipelineContextValue {
  reindexFile: (fileId: string) => Promise<void>;
  getTasks: () => ReturnType<BackgroundTaskQueue["getTasks"]>;
}

const ContentPipelineContext = createContext<ContentPipelineContextValue | null>(null);

export const useContentPipeline = (): ContentPipelineContextValue => {
  const value = useContext(ContentPipelineContext);
  if (!value) throw new Error("useContentPipeline must be used inside ContentPipelineRoot");
  return value;
};

export function ContentPipelineRoot({ children }: { children: ReactNode }) {
  const { store } = useStore();
  const rows = store.useQuery(contentPipelineFilesQuery$) as LiveStoreFile[];
  const settings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const queue = useMemo(() => createBackgroundTaskQueue(), []);
  const started = useRef(false);
  const legacyRefreshQueued = useRef(new Set<string>());
  const handlers = useMemo(
    () =>
      createContentTaskHandlers({
        store: store as unknown as Parameters<typeof createContentTaskHandlers>[0]["store"],
        vectorDb: modelWorkerFactory.vectorDb,
      }),
    [store],
  );

  const ensureStarted = useCallback(async () => {
    if (started.current) return;
    handlers.forEach((handler) => queue.registry.register(handler));
    await queue.start();
    started.current = true;
  }, [handlers, queue]);

  const reindexFile = useCallback(
    async (fileId: string) => {
      await ensureStarted();
      await queue.cancel(
        (task) =>
          task.kind === "content.extract" &&
          (task.payload as { fileId?: string }).fileId === fileId,
      );
      await queue.enqueue({
        kind: "content.extract",
        payload: { fileId },
        dedupeKey: `manual-extract:${fileId}:${Date.now()}`,
        priority: "user",
        resourceGroup: "document-parser",
      });
    },
    [ensureStarted, queue],
  );

  useEffect(() => {
    if (!settings.autoIndex) return;
    let disposed = false;
    void ensureStarted().then(async () => {
      if (disposed) return;
      for (const row of rows) {
        if (row.deletedAt || row.purgedAt) continue;
        const isPending = row.indexStatus === "pending";
        const isLegacyUnsupportedSummary =
          row.indexStatus === "indexed" &&
          row.indexSummary === "No extractable content for this file type." &&
          !legacyRefreshQueued.current.has(row.id);
        if (!isPending && !isLegacyUnsupportedSummary) continue;
        if (isLegacyUnsupportedSummary) legacyRefreshQueued.current.add(row.id);
        await queue.enqueue({
          kind: "content.extract",
          payload: { fileId: row.id },
          dedupeKey: `extract:${row.id}:${row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0}`,
          resourceGroup: "document-parser",
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, [ensureStarted, queue, rows, settings.autoIndex]);

  const value = useMemo<ContentPipelineContextValue>(
    () => ({ reindexFile, getTasks: () => queue.getTasks() }),
    [queue, reindexFile],
  );

  return (
    <ContentPipelineContext.Provider value={value}>{children}</ContentPipelineContext.Provider>
  );
}
