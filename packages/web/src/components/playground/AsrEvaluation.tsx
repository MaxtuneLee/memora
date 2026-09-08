import { DownloadSimpleIcon, PauseIcon, PlayIcon, WaveformIcon } from "@phosphor-icons/react";
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
import { whisperBaseTimestampedManifest } from "@memora/local-model-runtime";

import { datasetClient } from "@/lib/playground/datasetClient";
import { evaluationClient } from "@/lib/playground/evaluationClient";

const inputClassName =
  "h-11 w-full rounded-xl border border-memora-border bg-memora-surface px-3.5 text-sm text-memora-text outline-none transition focus:border-memora-olive-soft focus:ring-2 focus:ring-memora-olive-soft/30";
const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-memora-border bg-memora-surface px-4 text-sm font-medium text-memora-text transition hover:bg-memora-hover disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-memora-text-strong px-4 text-sm font-medium text-memora-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

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

function downloadJson(result: EvaluationResult) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${result.runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AsrEvaluation() {
  const [installed, setInstalled] = useState<InstalledDataset[]>([]);
  const [selectionKey, setSelectionKey] = useState("");
  const [language, setLanguage] = useState("hi");
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
      const evaluated = await evaluationClient.run(
        selectionOf(selected),
        whisperBaseTimestampedManifest.id,
        language,
        { signal: nextController.signal, onProgress: setProgress },
      );
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
    <section className="rounded-[28px] border border-memora-border bg-memora-surface px-5 py-6 shadow-sm-soft sm:px-7">
      <div className="max-w-2xl">
        <h2 className="font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
          ASR evaluation
        </h2>
        <p className="mt-2 text-sm leading-6 text-memora-text-muted">
          Run an installed audio split through a local model. Model call time includes queue
          waiting.
        </p>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)_auto]">
        <label className="text-sm font-medium text-memora-text">
          Installed split
          <select
            className={`${inputClassName} mt-2`}
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
        <label className="text-sm font-medium text-memora-text">
          ASR language
          <input
            className={`${inputClassName} mt-2`}
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={running}
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className={primaryButtonClassName}
            disabled={!selected || running || !language.trim()}
            onClick={() => void run()}
          >
            <PlayIcon className="size-4" /> Run evaluation
          </button>
          {running ? (
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={() => controller.current?.abort()}
            >
              <PauseIcon className="size-4" /> Cancel
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-memora-warning-border bg-memora-warning-surface px-3.5 py-3 text-sm text-memora-warning-text"
        >
          {error}
        </p>
      ) : null}
      {progress ? (
        <div className="mt-6 rounded-2xl bg-memora-surface-soft px-4 py-4">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-memora-text">Progress</span>
            <span className="tabular-nums text-memora-text-muted">
              {progress.completed} / {progress.total}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-memora-surface-muted">
            <div
              className="h-full bg-memora-olive transition-[width]"
              style={{
                width: `${progress.total ? Math.min(100, (progress.completed / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="mt-7">
          <div className="flex items-center justify-between gap-4">
            {saveNotice ? (
              <p
                role={saveNotice.status === "failed" ? "alert" : undefined}
                className={
                  saveNotice.status === "failed"
                    ? "text-sm text-memora-warning-text"
                    : "text-sm text-memora-text-soft"
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
              className={secondaryButtonClassName}
              onClick={() => downloadJson(result)}
            >
              <DownloadSimpleIcon className="size-4" /> Download JSON
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Status", result.status],
              ["Total", String(result.summary.total)],
              ["Succeeded", String(result.summary.succeeded)],
              ["Failed", String(result.summary.failed)],
              ["WER", percentage(result.summary.wer.value)],
              ["CER", percentage(result.summary.cer.value)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-memora-border bg-memora-surface-soft p-4"
              >
                <p className="text-xs text-memora-text-soft">{label}</p>
                <p className="mt-1 text-lg font-semibold text-memora-text-strong">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 divide-y divide-memora-border">
            {result.examples.map((example) => (
              <article key={example.index} className="py-4">
                <div className="flex items-center gap-2 text-xs text-memora-text-soft">
                  <WaveformIcon className="size-4" /> Example {example.index + 1} · {example.status}
                </div>
                {example.status === "succeeded" ? (
                  <>
                    <p className="mt-2 text-sm text-memora-text">
                      <span className="font-medium">Reference:</span> {example.reference}
                    </p>
                    <p className="mt-1 text-sm text-memora-text">
                      <span className="font-medium">Prediction:</span> {example.prediction}
                    </p>
                    <p className="mt-1 text-xs text-memora-text-soft">
                      Model call and queue wait: {example.modelCallMs.toFixed(0)} ms
                    </p>
                  </>
                ) : (
                  <p role="alert" className="mt-2 text-sm text-memora-warning-text">
                    {example.error.message}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {savedResults.length > 0 ? (
        <div className="mt-8 border-t border-memora-border pt-6">
          <h3 className="text-sm font-semibold text-memora-text">Saved results</h3>
          <div className="mt-3 divide-y divide-memora-border">
            {savedResults.map((summary) => (
              <button
                key={savedResultKey(summary)}
                type="button"
                className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-memora-hover"
                onClick={() => void viewSaved(summary.runId)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-memora-text">
                    {summary.dataset.datasetId} · {summary.dataset.configuration}/
                    {summary.dataset.split}
                  </span>
                  <span className="mt-0.5 block text-xs text-memora-text-soft">
                    {summary.status} · {new Date(summary.startedAt).toLocaleString()}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-memora-text-muted">
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
