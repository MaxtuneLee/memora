import { Tooltip } from "@base-ui/react/tooltip";
import { file as opfsFile } from "@memora/fs";
import { queryDb } from "@livestore/livestore";
import { ArrowCounterClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useAppStore } from "@/livestore/store";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";

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

const styles = stylex.create({
  sectionStack: { display: "flex", flexDirection: "column", gap: 20 },
  panelStack: { display: "flex", flexDirection: "column", gap: 20 },
  row: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  rowWideGap: { gap: 20 },
  block: { display: "block" },
  fieldLabel: {
    color: "var(--color-memora-text)",
    display: "block",
    fontSize: 14,
    fontWeight: 500,
  },
  helpText: {
    color: "var(--color-memora-text-muted)",
    display: "block",
    fontSize: 14,
    lineHeight: "24px",
    marginTop: 4,
  },
  select: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 12,
    color: "var(--color-memora-text)",
    fontSize: 14,
    marginTop: 12,
    outline: "none",
    paddingBlock: 10,
    paddingInline: 12,
    width: "100%",
    ":focus-visible": { boxShadow: "0 0 0 2px var(--color-memora-olive)" },
  },
  insetHeader: { alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" },
  muted: { color: "var(--color-memora-text-muted)", fontSize: 14 },
  strongMuted: { color: "var(--color-memora-text-soft)", fontSize: 12, fontWeight: 600 },
  progress: {
    backgroundColor: "var(--color-memora-border)",
    borderRadius: 9999,
    height: 8,
    marginTop: 12,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: "var(--color-memora-olive)",
    borderRadius: 9999,
    height: "100%",
    transitionDuration: "300ms",
    transitionProperty: "width",
  },
  awaiting: { marginTop: 16 },
  smallLabel: { color: "var(--color-memora-text-muted)", fontSize: 12, fontWeight: 500, margin: 0 },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    maxHeight: 96,
    overflowY: "auto",
    paddingRight: 4,
  },
  chip: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 9999,
    color: "var(--color-memora-text-muted)",
    fontSize: 12,
    maxWidth: "100%",
    overflow: "hidden",
    paddingBlock: 4,
    paddingInline: 10,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  buttonRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  disabledButtonWrap: { cursor: "not-allowed", display: "inline-flex" },
  tooltipPositioner: { zIndex: 60 },
  tooltip: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 8,
    boxShadow: "0 10px 15px rgb(0 0 0 / 0.1)",
    color: "var(--color-memora-text-muted)",
    fontSize: 12,
    lineHeight: "20px",
    maxWidth: 224,
    paddingBlock: 8,
    paddingInline: 12,
  },
  errorStack: { display: "flex", flexDirection: "column", gap: 12, marginTop: 16 },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  errorText: {
    color: "var(--color-memora-warning-text)",
    fontSize: 14,
    lineHeight: "24px",
    marginTop: 4,
  },
  warningIcon: { color: "var(--color-memora-warning-text)", height: 16, width: 16 },
  actionIcon: { height: 14, width: 14 },
  spin: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: stylex.keyframes({ to: { transform: "rotate(360deg)" } }),
  },
});

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
  const { getTasks, indexUnindexed, reindexAll, reindexSemantic, subscribeTasks } =
    useContentPipeline();
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
    <div {...stylex.props(styles.sectionStack)}>
      <section
        className={`${SETTINGS_PANEL_CLASS_NAME} ${stylex.props(styles.panelStack).className}`}
      >
        <div {...stylex.props(styles.row)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Indexing</h3>
          <Badge>Index database · {formatBytes(databaseSize)}</Badge>
        </div>

        <div
          className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row, styles.rowWideGap).className}`}
        >
          <span>
            <span {...stylex.props(styles.fieldLabel)}>
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

        <label className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.block).className}`}>
          <span {...stylex.props(styles.fieldLabel)}>Retrieval method</span>
          <span {...stylex.props(styles.helpText)}>
            Choose which completed local index powers search.
          </span>
          <select
            {...stylex.props(styles.select)}
            value={settings.semanticSearchMode}
            onChange={(event) => {
              const mode = event.target.value as setting["semanticSearchMode"];
              store.commit(
                settingEvents.settingsSet({
                  semanticSearchMode: mode,
                  semanticSearchEnabled: mode !== "bm25",
                }),
              );
              if (mode !== "bm25") void reindexSemantic();
            }}
          >
            <option value="hybrid">BM25 + BGE hybrid search</option>
            <option value="bm25">BM25 search</option>
            <option value="bge">BGE semantic search</option>
          </select>
        </label>

        <div className={SETTINGS_INSET_PANEL_CLASS_NAME}>
          <div {...stylex.props(styles.insetHeader)}>
            <span {...stylex.props(styles.fieldLabel)}>Indexed files</span>
            <span {...stylex.props(styles.strongMuted)}>
              {indexedFileCount} / {files.length}
            </span>
          </div>
          <div
            {...stylex.props(styles.progress)}
            role="progressbar"
            aria-label="Indexed files"
            aria-valuemin={0}
            aria-valuemax={files.length}
            aria-valuenow={indexedFileCount}
          >
            <div {...stylex.props(styles.progressFill)} style={{ width: `${indexingProgress}%` }} />
          </div>
          {unindexedFiles.length > 0 ? (
            <div {...stylex.props(styles.awaiting)}>
              <p {...stylex.props(styles.smallLabel)}>Awaiting index</p>
              <div {...stylex.props(styles.chips)}>
                {unindexedFiles.map((file) => (
                  <span key={file.id} title={file.name} {...stylex.props(styles.chip)}>
                    {file.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.muted)}>
            {pipelineTaskCount > 0
              ? `${pipelineTaskCount} files in the pipeline`
              : files.length > 0 && unindexedFiles.length === 0
                ? "All files indexed"
                : "Ready to index"}
          </span>
          <div {...stylex.props(styles.buttonRow)}>
            <Button
              variant="oliveGhost"
              disabled={files.length === 0 || isIndexingUnindexed || isReindexingAll}
              onClick={() => void handleReindexAll()}
            >
              <ArrowCounterClockwiseIcon
                className={
                  stylex.props(styles.actionIcon, isReindexingAll && styles.spin).className
                }
                weight="bold"
              />
              {isReindexingAll ? "Reindexing…" : "Reindex all"}
            </Button>
            {startIndexingDisabledReason ? (
              <Tooltip.Root>
                <Tooltip.Trigger
                  render={
                    <span {...stylex.props(styles.disabledButtonWrap)} tabIndex={0}>
                      <Button disabled variant="primary">
                        Start indexing
                      </Button>
                    </span>
                  }
                />
                <Tooltip.Portal>
                  <Tooltip.Positioner
                    side="top"
                    sideOffset={8}
                    {...stylex.props(styles.tooltipPositioner)}
                  >
                    <Tooltip.Popup {...stylex.props(styles.tooltip)}>
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
          <div {...stylex.props(styles.row)}>
            <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Pipeline errors</h3>
            <WarningCircleIcon
              className={stylex.props(styles.warningIcon).className}
              weight="fill"
            />
          </div>
          <div {...stylex.props(styles.errorStack)}>
            {failedFiles.map((file) => (
              <div key={file.id} className={SETTINGS_INSET_PANEL_CLASS_NAME}>
                <p {...stylex.props(styles.fieldLabel, styles.truncate)}>{file.name}</p>
                <p {...stylex.props(styles.errorText)}>{file.indexSummary ?? "Indexing failed."}</p>
              </div>
            ))}
            {diagnostics.failed.map((task) => (
              <div key={task.id} className={SETTINGS_INSET_PANEL_CLASS_NAME}>
                <p {...stylex.props(styles.fieldLabel)}>{task.kind}</p>
                <p {...stylex.props(styles.errorText)}>
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
