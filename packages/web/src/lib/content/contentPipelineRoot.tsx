import { queryDb } from "@livestore/livestore";
import { useAppStore } from "@/livestore/store";
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
import { readEmbeddingRuntime } from "@/lib/models/readEmbeddingRuntime";
import { getVectorDbIndexId } from "@/lib/vector-db";
import { BackgroundTaskQueue, createBackgroundTaskQueue } from "@/lib/background-tasks";
import { fileTable, type file as LiveStoreFile } from "@/livestore/file";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeSettingsValue, settingsTable, type setting } from "@/livestore/setting";

const contentPipelineFilesQuery$ = queryDb(
  () => fileTable.where({ deletedAt: null, purgedAt: null }).orderBy("updatedAt", "desc"),
  { label: "content-pipeline:files" },
);
import { createContentTaskHandlers } from "./contentTaskHandlers";
import { readContentArtifact } from ".";

interface ContentPipelineContextValue {
  reindexFile: (fileId: string) => Promise<void>;
  indexUnindexed: () => Promise<void>;
  reindexAll: () => Promise<void>;
  reindexSemantic: () => Promise<void>;
  purgeFile: (fileId: string) => Promise<void>;
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
  const store = useAppStore();
  const rows = store.useQuery(contentPipelineFilesQuery$) as LiveStoreFile[];
  const settings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const queue = useMemo(() => createBackgroundTaskQueue(), []);
  const started = useRef(false);
  const legacyRefreshQueued = useRef(new Set<string>());
  const semanticFingerprintChecked = useRef(new Set<string>());
  const handlers = useMemo(
    () =>
      createContentTaskHandlers({
        store: store as unknown as Parameters<typeof createContentTaskHandlers>[0]["store"],
        vectorDb: modelWorkerFactory.vectorDb,
        getEmbeddingRuntime: () => readEmbeddingRuntime(store),
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

  const purgeFile = useCallback(
    async (fileId: string) => {
      await ensureStarted();
      await queue.enqueue({
        kind: "content.delete",
        payload: { fileId },
        dedupeKey: `delete:${fileId}`,
        priority: "user",
        resourceGroup: "io",
      });
    },
    [ensureStarted, queue],
  );

  const reindexSemantic = useCallback(async () => {
    const runtime = readEmbeddingRuntime(store);
    if (!runtime) return;
    await ensureStarted();
    const indexId = await getVectorDbIndexId(runtime.indexConfig);
    await queue.cancel((task) => task.kind === "content.index.semantic");
    for (const row of rows) {
      if (row.deletedAt || row.purgedAt || row.indexStatus !== "indexed") continue;
      await queue.enqueue({ kind: "content.index.semantic", payload: { fileId: row.id, indexId },
        dedupeKey: `semantic-rebuild:${row.id}:${indexId}:${Date.now()}`, priority: "user", resourceGroup: "embedding" });
    }
  }, [ensureStarted, queue, rows, store]);

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
      const runtime = readEmbeddingRuntime(store);
      const indexId = runtime ? await getVectorDbIndexId(runtime.indexConfig) : null;
      const fingerprintsByFileId = new Map<string, string>();
      for (const row of rows) {
        if (row.deletedAt || row.purgedAt) continue;
        const isPending = isPendingFileReadyForIndexing(row);
        const isLegacyUnsupportedSummary =
          row.indexStatus === "indexed" &&
          row.indexSummary === "No extractable content for this file type." &&
          !legacyRefreshQueued.current.has(row.id);
        if (isPending || isLegacyUnsupportedSummary) {
          if (isLegacyUnsupportedSummary) legacyRefreshQueued.current.add(row.id);
          await queue.enqueue({
            kind: "content.extract",
            payload: { fileId: row.id },
            dedupeKey: `extract:${row.id}:${row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0}`,
            resourceGroup: "document-parser",
          });
          continue;
        }
        // A synced indexStatus of "indexed" can arrive from another device (or a
        // storage import) without this device's local vector-db actually holding the
        // document. Check each such row's fingerprint against the local index once
        // per pipeline start and repair drift instead of trusting the synced status.
        if (
          runtime &&
          indexId &&
          row.indexStatus === "indexed" &&
          !semanticFingerprintChecked.current.has(row.id)
        ) {
          semanticFingerprintChecked.current.add(row.id);
          const artifact = await readContentArtifact(row.id);
          if (artifact) fingerprintsByFileId.set(row.id, artifact.sourceRevision);
        }
      }
      if (disposed || !runtime || !indexId || fingerprintsByFileId.size === 0) return;
      const statuses = await modelWorkerFactory.vectorDb
        .forIndex(runtime.indexConfig)
        .checkDocuments(
          Array.from(fingerprintsByFileId, ([fileId, contentHash]) => ({
            documentId: fileId,
            contentHash,
          })),
        );
      const reconciled = new Set(
        statuses.filter((status) => status.matches).map((status) => status.documentId),
      );
      for (const fileId of fingerprintsByFileId.keys()) {
        if (disposed || reconciled.has(fileId)) continue;
        await queue.enqueue({
          kind: "content.index.semantic",
          payload: { fileId, indexId },
          dedupeKey: `semantic-reconcile:${fileId}:${indexId}`,
          resourceGroup: "embedding",
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, [ensureStarted, queue, rows, settings.autoIndex, store]);

  const value = useMemo<ContentPipelineContextValue>(
    () => ({
      reindexFile,
      indexUnindexed,
      reindexAll,
      reindexSemantic,
      purgeFile,
      getTasks: () => queue.getTasks(),
      subscribeTasks: (listener) => queue.subscribe(listener),
    }),
    [indexUnindexed, purgeFile, queue, reindexAll, reindexFile, reindexSemantic],
  );

  return (
    <ContentPipelineContext.Provider value={value}>{children}</ContentPipelineContext.Provider>
  );
}
