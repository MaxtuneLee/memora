import { DownloadSimpleIcon, PauseIcon, PlayIcon, WaveformIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InstalledDataset } from "@memora/datasets";
import {
  listEvaluationResults,
  readEvaluationResult,
  saveEvaluationResult,
  type EvaluationProgress,
  type EvaluationResult,
  type SavedResultSummary,
} from "@memora/evaluation";
import {
  nemotron35AsrStreamingManifest,
  whisperBaseTimestampedManifest,
} from "@memora/local-model-runtime";

import { datasetClient } from "@/lib/playground/datasetClient";
import { downloadEvaluationJson } from "@/lib/playground/downloadEvaluationJson";
import { evaluationClient } from "@/lib/playground/evaluationClient";

const styles = stylex.create({
  panel: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "28px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 3px rgba(47,45,40,0.08)",
    paddingBlock: "1.5rem",
    paddingInline: { default: "1.25rem", "@media (min-width: 640px)": "1.75rem" },
  },
  intro: { maxWidth: "42rem" },
  title: {
    color: "var(--color-memora-text-strong)",
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.5rem",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: "2rem",
  },
  description: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.5rem",
  },
  form: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 768px)":
        "minmax(0, 1fr) minmax(180px, 0.35fr) minmax(180px, 0.35fr) auto",
    },
    marginTop: "1.5rem",
  },
  label: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
  },
  input: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    height: "2.75rem",
    marginTop: "0.5rem",
    outline: "none",
    paddingInline: "0.875rem",
    transition: "border-color 150ms, box-shadow 150ms",
    width: "100%",
    ":focus": {
      borderColor: "var(--color-memora-olive-soft)",
      boxShadow: "0 0 0 2px color-mix(in srgb, var(--color-memora-olive-soft) 30%, transparent)",
    },
  },
  actions: { alignItems: "flex-end", display: "flex", gap: "0.5rem" },
  button: {
    alignItems: "center",
    borderRadius: "0.75rem",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    height: "2.5rem",
    justifyContent: "center",
    paddingInline: "1rem",
    transition: "background-color 150ms, opacity 150ms",
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  primaryButton: {
    backgroundColor: "var(--color-memora-text-strong)",
    color: "var(--color-memora-surface)",
    ":hover": { opacity: 0.9 },
  },
  secondaryButton: {
    backgroundColor: {
      default: "var(--color-memora-surface)",
      ":hover": "var(--color-memora-hover)",
    },
    borderColor: "var(--color-memora-border)",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text)",
  },
  icon: { height: "1rem", width: "1rem" },
  error: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderColor: "var(--color-memora-warning-border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-warning-text)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "1rem",
    paddingBlock: "0.75rem",
    paddingInline: "0.875rem",
  },
  progress: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRadius: "1rem",
    marginTop: "1.5rem",
    padding: "1rem",
  },
  progressHeader: {
    alignItems: "center",
    display: "flex",
    fontSize: "0.875rem",
    gap: "1rem",
    justifyContent: "space-between",
    lineHeight: "1.25rem",
  },
  progressLabel: { color: "var(--color-memora-text)", fontWeight: 500 },
  progressValue: { color: "var(--color-memora-text-muted)", fontVariantNumeric: "tabular-nums" },
  progressTrack: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "9999px",
    height: "0.375rem",
    marginTop: "0.75rem",
    overflow: "hidden",
  },
  progressBar: {
    backgroundColor: "var(--color-memora-olive)",
    height: "100%",
    transition: "width 150ms",
  },
  results: { marginTop: "1.75rem" },
  resultHeader: {
    alignItems: "center",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
  },
  notice: { fontSize: "0.875rem", lineHeight: "1.25rem" },
  noticeMuted: { color: "var(--color-memora-text-soft)" },
  noticeError: { color: "var(--color-memora-warning-text)" },
  summaryGrid: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 640px)": "repeat(3, minmax(0, 1fr))",
      "@media (min-width: 1024px)": "repeat(6, minmax(0, 1fr))",
    },
    marginTop: "1rem",
  },
  summaryCard: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "1rem",
  },
  summaryLabel: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem", lineHeight: "1rem" },
  summaryValue: {
    color: "var(--color-memora-text-strong)",
    fontSize: "1.125rem",
    fontWeight: 600,
    lineHeight: "1.75rem",
    marginTop: "0.25rem",
  },
  examples: { marginTop: "1.5rem" },
  example: {
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBlock: "1rem",
    ":last-child": { borderBottomWidth: 0 },
  },
  exampleMeta: {
    alignItems: "center",
    color: "var(--color-memora-text-soft)",
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.5rem",
    lineHeight: "1rem",
  },
  exampleText: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  exampleTextSecondary: { marginTop: "0.25rem" },
  strong: { fontWeight: 500 },
  timing: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.25rem",
  },
  exampleError: { color: "var(--color-memora-warning-text)" },
  saved: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "2rem",
    paddingTop: "1.5rem",
  },
  savedTitle: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
  },
  savedList: { marginTop: "0.75rem" },
  savedRow: {
    alignItems: "center",
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
    paddingBlock: "0.75rem",
    textAlign: "left",
    width: "100%",
    ":hover": { backgroundColor: "var(--color-memora-hover)" },
    ":last-child": { borderBottomWidth: 0 },
  },
  savedCopy: { minWidth: 0 },
  savedName: {
    color: "var(--color-memora-text)",
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  savedMeta: {
    color: "var(--color-memora-text-soft)",
    display: "block",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.125rem",
  },
  savedCount: {
    color: "var(--color-memora-text-muted)",
    flexShrink: 0,
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
  },
});

const keyOf = (item: InstalledDataset) =>
  [item.datasetId, item.revision, item.configuration, item.split].join(":");
const selectionOf = (item: InstalledDataset) => ({
  datasetId: item.datasetId,
  revision: item.revision,
  configuration: item.configuration,
  split: item.split,
});
const percentage = (value: number | null) =>
  value === null ? "Unavailable" : `${(value * 100).toFixed(2)}%`;
const savedResultKey = (summary: SavedResultSummary) => summary.runId;

export default function AsrEvaluation() {
  const [installed, setInstalled] = useState<InstalledDataset[]>([]);
  const [selectionKey, setSelectionKey] = useState("");
  const [language, setLanguage] = useState("en");
  const [modelId, setModelId] = useState(whisperBaseTimestampedManifest.id);
  const [progress, setProgress] = useState<EvaluationProgress>();
  const [result, setResult] = useState<EvaluationResult>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [savedResults, setSavedResults] = useState<SavedResultSummary[]>([]);
  const [saveNotice, setSaveNotice] = useState<{ status: "saved" | "failed"; message?: string }>();
  const controller = useRef<AbortController | undefined>(undefined);
  const selected = useMemo(
    () => installed.find((item) => keyOf(item) === selectionKey),
    [installed, selectionKey],
  );

  const refreshSavedResults = () =>
    void listEvaluationResults().then(setSavedResults, () => setSavedResults([]));

  useEffect(() => {
    void datasetClient.list().then((items) => {
      setInstalled(items);
      setSelectionKey((current) => current || (items[0] ? keyOf(items[0]) : ""));
    });
    refreshSavedResults();
    return () => controller.current?.abort();
  }, []);

  const run = async () => {
    if (!selected) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    setSaveNotice(undefined);
    setProgress({ completed: 0, total: selected.examples ?? 0 });
    try {
      const evaluated = await evaluationClient.run(selectionOf(selected), modelId, language, {
        signal: nextController.signal,
        onProgress: setProgress,
      });
      setResult(evaluated);
      try {
        await saveEvaluationResult(evaluated);
        setSaveNotice({ status: "saved" });
        refreshSavedResults();
      } catch (reason) {
        setSaveNotice({
          status: "failed",
          message: reason instanceof Error ? reason.message : "The result could not be saved.",
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evaluation failed.");
    } finally {
      setRunning(false);
      controller.current = undefined;
    }
  };

  const viewSaved = async (runId: string) => {
    setError(undefined);
    try {
      const loaded = await readEvaluationResult(runId);
      setProgress(undefined);
      setSaveNotice(undefined);
      setResult(loaded);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved result could not be opened.");
    }
  };

  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.intro)}>
        <h2 {...stylex.props(styles.title)}>ASR evaluation</h2>
        <p {...stylex.props(styles.description)}>
          Run an installed audio split through a local model. Model call time includes queue
          waiting.
        </p>
      </div>
      <div {...stylex.props(styles.form)}>
        <label {...stylex.props(styles.label)}>
          Installed split
          <select
            className={stylex.props(styles.input).className}
            value={selectionKey}
            onChange={(event) => setSelectionKey(event.target.value)}
            disabled={running}
          >
            {installed.length === 0 ? (
              <option value="">Install a dataset split first</option>
            ) : null}
            {installed.map((item) => (
              <option key={keyOf(item)} value={keyOf(item)}>
                {item.datasetId} · {item.configuration}/{item.split}
              </option>
            ))}
          </select>
        </label>
        <label {...stylex.props(styles.label)}>
          Model
          <select
            className={stylex.props(styles.input).className}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            disabled={running}
          >
            <option value={whisperBaseTimestampedManifest.id}>
              {whisperBaseTimestampedManifest.displayName}
            </option>
            <option value={nemotron35AsrStreamingManifest.id}>
              {nemotron35AsrStreamingManifest.displayName}
            </option>
          </select>
        </label>
        <label {...stylex.props(styles.label)}>
          ASR language
          <input
            className={stylex.props(styles.input).className}
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={running}
          />
        </label>
        <div {...stylex.props(styles.actions)}>
          <button
            type="button"
            className={stylex.props(styles.button, styles.primaryButton).className}
            disabled={!selected || running || !language.trim()}
            onClick={() => void run()}
          >
            <PlayIcon className={stylex.props(styles.icon).className} /> Run evaluation
          </button>
          {running ? (
            <button
              type="button"
              className={stylex.props(styles.button, styles.secondaryButton).className}
              onClick={() => controller.current?.abort()}
            >
              <PauseIcon className={stylex.props(styles.icon).className} /> Cancel
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className={stylex.props(styles.error).className}>
          {error}
        </p>
      ) : null}
      {progress ? (
        <div {...stylex.props(styles.progress)}>
          <div {...stylex.props(styles.progressHeader)}>
            <span {...stylex.props(styles.progressLabel)}>Progress</span>
            <span {...stylex.props(styles.progressValue)}>
              {progress.completed} / {progress.total}
            </span>
          </div>
          <div {...stylex.props(styles.progressTrack)}>
            <div
              {...stylex.props(styles.progressBar)}
              style={{
                width: `${progress.total ? Math.min(100, (progress.completed / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      ) : null}
      {result ? (
        <div {...stylex.props(styles.results)}>
          <div {...stylex.props(styles.resultHeader)}>
            {saveNotice ? (
              <p
                role={saveNotice.status === "failed" ? "alert" : undefined}
                className={
                  stylex.props(
                    styles.notice,
                    saveNotice.status === "failed" ? styles.noticeError : styles.noticeMuted,
                  ).className
                }
              >
                {saveNotice.status === "saved"
                  ? "Saved."
                  : `Not saved: ${saveNotice.message ?? "unknown error"}`}
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              className={stylex.props(styles.button, styles.secondaryButton).className}
              onClick={() => downloadEvaluationJson(result)}
            >
              <DownloadSimpleIcon className={stylex.props(styles.icon).className} /> Download JSON
            </button>
          </div>
          <div {...stylex.props(styles.summaryGrid)}>
            {[
              ["Status", result.status],
              ["Total", String(result.summary.total)],
              ["Succeeded", String(result.summary.succeeded)],
              ["Failed", String(result.summary.failed)],
              ["WER", percentage(result.summary.wer.value)],
              ["CER", percentage(result.summary.cer.value)],
            ].map(([label, value]) => (
              <div key={label} className={stylex.props(styles.summaryCard).className}>
                <p {...stylex.props(styles.summaryLabel)}>{label}</p>
                <p {...stylex.props(styles.summaryValue)}>{value}</p>
              </div>
            ))}
          </div>
          <div {...stylex.props(styles.examples)}>
            {result.examples.map((example) => (
              <article key={example.index} {...stylex.props(styles.example)}>
                <div {...stylex.props(styles.exampleMeta)}>
                  <WaveformIcon className={stylex.props(styles.icon).className} /> Example{" "}
                  {example.index + 1} · {example.status}
                </div>
                {example.status === "succeeded" ? (
                  <>
                    <p {...stylex.props(styles.exampleText)}>
                      <span {...stylex.props(styles.strong)}>Reference:</span> {example.reference}
                    </p>
                    <p {...stylex.props(styles.exampleText, styles.exampleTextSecondary)}>
                      <span {...stylex.props(styles.strong)}>Prediction:</span> {example.prediction}
                    </p>
                    <p {...stylex.props(styles.timing)}>
                      Model call and queue wait: {example.modelCallMs.toFixed(0)} ms
                    </p>
                  </>
                ) : (
                  <p role="alert" {...stylex.props(styles.exampleText, styles.exampleError)}>
                    {example.error.message}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {savedResults.length > 0 ? (
        <div {...stylex.props(styles.saved)}>
          <h3 {...stylex.props(styles.savedTitle)}>Saved results</h3>
          <div {...stylex.props(styles.savedList)}>
            {savedResults.map((summary) => (
              <button
                key={savedResultKey(summary)}
                type="button"
                className={stylex.props(styles.savedRow).className}
                onClick={() => void viewSaved(summary.runId)}
              >
                <span {...stylex.props(styles.savedCopy)}>
                  <span {...stylex.props(styles.savedName)}>
                    {summary.dataset.datasetId} · {summary.dataset.configuration}/
                    {summary.dataset.split}
                  </span>
                  <span {...stylex.props(styles.savedMeta)}>
                    {summary.status} · {new Date(summary.startedAt).toLocaleString()}
                  </span>
                </span>
                <span {...stylex.props(styles.savedCount)}>
                  {summary.summary.succeeded}/{summary.summary.total} succeeded
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
