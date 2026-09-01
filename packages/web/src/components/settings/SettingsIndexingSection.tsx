import { Tooltip } from "@base-ui/react/tooltip";
import { file as opfsFile } from "@memora/fs";
import { queryDb } from "@livestore/livestore";
import { ArrowCounterClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useAppStore } from "@/livestore/store";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { useContentPipeline } from "@/lib/content/contentPipelineRoot";
import { formatBytes } from "@/lib/format";
import { summarizeBackgroundTasks } from "@/lib/background-tasks";
import { fileTable, type file as LiveStoreFile } from "@/livestore/file";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { LEXICAL_INDEX_CONFIG } from "@/lib/search/searchIndexConfig";
import {
  normalizeSettingsValue,
  settingEvents,
  settingsTable,
  type setting,
} from "@/livestore/setting";
import { getVectorDbIndexId } from "@/lib/vector-db";

const indexingFilesQuery$ = queryDb(
  () => fileTable.where({ deletedAt: null, purgedAt: null }).orderBy("updatedAt", "desc"),
  { label: "settings:indexing-files" },
);

const getIndexDatabaseSize = async (): Promise<number> => {
  const indexId = await getVectorDbIndexId(LEXICAL_INDEX_CONFIG);
  const database = opfsFile(`/search-indexes/${indexId}.sqlite3`);
  if (!(await database.exists())) {
    return 0;
  }
  return database.getSize?.() ?? 0;
};

export default function SettingsIndexingSection() {
  const store = useAppStore();
  const { getTasks, indexUnindexed, reindexAll, subscribeTasks } = useContentPipeline();
  const settings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const files = store.useQuery(indexingFilesQuery$) as LiveStoreFile[];
  const [tasks, setTasks] = useState(() => getTasks());
  const [databaseSize, setDatabaseSize] = useState(0);
  const [isIndexingUnindexed, setIsIndexingUnindexed] = useState(false);
  const [isReindexingAll, setIsReindexingAll] = useState(false);
  const indexedFileCount = useMemo(
    () => files.filter((file) => file.indexStatus === "indexed").length,
    [files],
  );
  const indexingProgress = files.length > 0 ? (indexedFileCount / files.length) * 100 : 0;
  const diagnostics = useMemo(
    () => summarizeBackgroundTasks(tasks.filter((task) => task.kind.startsWith("content."))),
    [tasks],
  );
  const failedFiles = useMemo(() => files.filter((file) => file.indexStatus === "failed"), [files]);
  const unindexedFiles = useMemo(
    () => files.filter((file) => file.indexStatus !== "indexed"),
    [files],
  );
  const hasPipelineErrors = failedFiles.length + diagnostics.failed.length > 0;
  const pipelineTaskCount = diagnostics.byState.running + diagnostics.byState.queued;
  const startIndexingDisabledReason = isReindexingAll
    ? "Reindexing all files."
    : files.length === 0
      ? "Upload a file before starting indexing."
      : unindexedFiles.length === 0
        ? "All files are already indexed."
        : null;

  useEffect(() => {
    setTasks(getTasks());
    return subscribeTasks(() => setTasks(getTasks()));
  }, [getTasks, subscribeTasks]);

  useEffect(() => {
    let cancelled = false;
    void getIndexDatabaseSize().then((size) => {
      if (!cancelled) {
        setDatabaseSize(size);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [indexedFileCount]);

  const handleStartIndexing = useCallback(async (): Promise<void> => {
    setIsIndexingUnindexed(true);
    try {
      await indexUnindexed();
    } finally {
      setIsIndexingUnindexed(false);
    }
  }, [indexUnindexed]);

  const handleReindexAll = useCallback(async (): Promise<void> => {
    setIsReindexingAll(true);
    try {
      await reindexAll();
    } finally {
      setIsReindexingAll(false);
    }
  }, [reindexAll]);

  return (
    <div className="space-y-5">
      <section className={`${SETTINGS_PANEL_CLASS_NAME} space-y-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Indexing</h3>
          <Badge>Index database · {formatBytes(databaseSize)}</Badge>
        </div>

        <div className={`${SETTINGS_ROW_CLASS_NAME} flex items-center justify-between gap-5`}>
          <span>
            <span className="block text-sm font-medium text-[var(--color-memora-text)]">
              Automatically index new and changed files
            </span>
          </span>
          <Switch
            checked={settings.autoIndex}
            aria-label="Automatically index new and changed files"
            onCheckedChange={(checked) =>
              store.commit(settingEvents.settingsSet({ autoIndex: checked }))
            }
          />
        </div>

        <label className={`${SETTINGS_ROW_CLASS_NAME} block`}>
          <span className="block text-sm font-medium text-[var(--color-memora-text)]">
            Retrieval method
          </span>
          <span className="mt-1 block text-sm leading-6 text-[var(--color-memora-text-muted)]">
            Choose which completed local index powers search.
          </span>
          <select
            className="mt-3 w-full rounded-xl border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-3 py-2.5 text-sm text-[var(--color-memora-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-memora-olive)]"
            value={settings.semanticSearchMode}
            onChange={(event) =>
              store.commit(
                settingEvents.settingsSet({
                  semanticSearchMode: event.target.value as setting["semanticSearchMode"],
                  semanticSearchEnabled: event.target.value !== "bm25",
                }),
              )
            }
          >
            <option value="hybrid">BM25 + BGE hybrid search</option>
            <option value="bm25">BM25 search</option>
            <option value="bge">BGE semantic search</option>
          </select>
        </label>

        <div className={SETTINGS_INSET_PANEL_CLASS_NAME}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-[var(--color-memora-text)]">
              Indexed files
            </span>
            <span className="text-xs font-semibold text-[var(--color-memora-text-soft)]">
              {indexedFileCount} / {files.length}
            </span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-memora-border)]"
            role="progressbar"
            aria-label="Indexed files"
            aria-valuemin={0}
            aria-valuemax={files.length}
            aria-valuenow={indexedFileCount}
          >
            <div
              className="h-full rounded-full bg-[var(--color-memora-olive)] transition-[width] duration-300"
              style={{ width: `${indexingProgress}%` }}
            />
          </div>
          {unindexedFiles.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-medium text-[var(--color-memora-text-muted)]">
                Awaiting index
              </p>
              <div className="mt-2 flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1">
                {unindexedFiles.map((file) => (
                  <span
                    key={file.id}
                    title={file.name}
                    className="max-w-full truncate rounded-full border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-2.5 py-1 text-xs text-[var(--color-memora-text-muted)]"
                  >
                    {file.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-[var(--color-memora-text-muted)]">
            {pipelineTaskCount > 0
              ? `${pipelineTaskCount} files in the pipeline`
              : files.length > 0 && unindexedFiles.length === 0
                ? "All files indexed"
                : "Ready to index"}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="oliveGhost"
              disabled={files.length === 0 || isIndexingUnindexed || isReindexingAll}
              onClick={() => void handleReindexAll()}
            >
              <ArrowCounterClockwiseIcon
                className={`size-3.5 ${isReindexingAll ? "animate-spin" : ""}`}
                weight="bold"
              />
              {isReindexingAll ? "Reindexing…" : "Reindex all"}
            </Button>
            {startIndexingDisabledReason ? (
              <Tooltip.Root>
                <Tooltip.Trigger
                  render={
                    <span className="inline-flex cursor-not-allowed" tabIndex={0}>
                      <Button disabled variant="primary">
                        Start indexing
                      </Button>
                    </span>
                  }
                />
                <Tooltip.Portal>
                  <Tooltip.Positioner side="top" sideOffset={8} className="z-60">
                    <Tooltip.Popup className="max-w-56 rounded-lg border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-3 py-2 text-xs leading-5 text-[var(--color-memora-text-muted)] shadow-lg">
                      {startIndexingDisabledReason}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            ) : (
              <Button
                variant="primary"
                disabled={isIndexingUnindexed}
                onClick={() => void handleStartIndexing()}
              >
                {isIndexingUnindexed ? "Starting…" : "Start indexing"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {hasPipelineErrors ? (
        <section className={SETTINGS_PANEL_CLASS_NAME}>
          <div className="flex items-center justify-between gap-3">
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Pipeline errors</h3>
            <WarningCircleIcon
              className="size-4 text-[var(--color-memora-warning-text)]"
              weight="fill"
            />
          </div>
          <div className="mt-4 space-y-3">
            {failedFiles.map((file) => (
              <div key={file.id} className={SETTINGS_INSET_PANEL_CLASS_NAME}>
                <p className="truncate text-sm font-medium text-[var(--color-memora-text)]">
                  {file.name}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-memora-warning-text)]">
                  {file.indexSummary ?? "Indexing failed."}
                </p>
              </div>
            ))}
            {diagnostics.failed.map((task) => (
              <div key={task.id} className={SETTINGS_INSET_PANEL_CLASS_NAME}>
                <p className="text-sm font-medium text-[var(--color-memora-text)]">{task.kind}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-memora-warning-text)]">
                  {task.error?.message ?? "The pipeline task failed."}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
