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
  indexUnindexed: () => Promise<void>;
  reindexAll: () => Promise<void>;
  getTasks: () => ReturnType<BackgroundTaskQueue["getTasks"]>;
  subscribeTasks: (listener: () => void) => () => void;
}

const ContentPipelineContext = createContext<ContentPipelineContextValue | null>(null);

export const isPendingFileReadyForIndexing = (
  row: Pick<LiveStoreFile, "indexStatus" | "transcriptPath" | "type">,
): boolean => {
  if (row.indexStatus !== "pending") return false;
  if ((row.type === "audio" || row.type === "video") && !row.transcriptPath) {
    return false;
  }
  return true;
};

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

  const reindexAll = useCallback(async () => {
    await ensureStarted();
    const indexableRows = rows.filter((row) => !row.deletedAt && !row.purgedAt);
    await Promise.all(
      indexableRows.map(async (row) => {
        await queue.cancel(
          (task) =>
            task.kind === "content.extract" &&
            (task.payload as { fileId?: string }).fileId === row.id,
        );
        await queue.enqueue({
          kind: "content.extract",
          payload: { fileId: row.id },
          dedupeKey: `manual-extract:${row.id}:${Date.now()}`,
          priority: "user",
          resourceGroup: "document-parser",
        });
      }),
    );
  }, [ensureStarted, queue, rows]);

  const indexUnindexed = useCallback(async () => {
    await ensureStarted();
    const rowsToIndex = rows.filter(
      (row) =>
        !row.deletedAt &&
        !row.purgedAt &&
        row.indexStatus !== "indexed" &&
        row.indexStatus !== "processing",
    );
    await Promise.all(
      rowsToIndex.map((row) =>
        queue.enqueue({
          kind: "content.extract",
          payload: { fileId: row.id },
          dedupeKey:
            row.indexStatus === "failed"
              ? `manual-extract:${row.id}:${Date.now()}`
              : `extract:${row.id}:${row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0}`,
          priority: "user",
          resourceGroup: "document-parser",
        }),
      ),
    );
  }, [ensureStarted, queue, rows]);

  useEffect(() => {
    if (!settings.autoIndex) return;
    let disposed = false;
    void ensureStarted().then(async () => {
      if (disposed) return;
      for (const row of rows) {
        if (row.deletedAt || row.purgedAt) continue;
        const isPending = isPendingFileReadyForIndexing(row);
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
    () => ({
      reindexFile,
      indexUnindexed,
      reindexAll,
      getTasks: () => queue.getTasks(),
      subscribeTasks: (listener) => queue.subscribe(listener),
    }),
    [indexUnindexed, queue, reindexAll, reindexFile],
  );

  return (
    <ContentPipelineContext.Provider value={value}>{children}</ContentPipelineContext.Provider>
  );
}
