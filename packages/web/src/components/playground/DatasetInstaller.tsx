import {
  DatabaseIcon,
  DownloadSimpleIcon,
  HardDrivesIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type {
  DatasetExample,
  DatasetInspection,
  DatasetSelection,
  FeatureSchema,
  InstalledDataset,
  MediaReference,
} from "@memora/datasets";

import { datasetClient } from "@/lib/playground/datasetClient";
import { formatBytes } from "@/lib/format";

const inputClassName =
  "h-11 w-full rounded-xl border border-memora-border bg-memora-surface px-3.5 text-sm text-memora-text outline-none transition focus:border-memora-olive-soft focus:ring-2 focus:ring-memora-olive-soft/30";
const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-memora-border bg-memora-surface px-4 text-sm font-medium text-memora-text transition hover:bg-memora-hover disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-memora-text-strong px-4 text-sm font-medium text-memora-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function selectionOf(installed: InstalledDataset): DatasetSelection {
  return {
    datasetId: installed.datasetId,
    revision: installed.revision,
    configuration: installed.configuration,
    split: installed.split,
  };
}

function displayValue(value: unknown, fallback: string): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
}

function displayLabel(value: unknown, features: FeatureSchema): string {
  const feature = features.lang_id ?? features.label;
  if (feature?.type === "classLabel" && typeof value === "number") {
    return feature.names[value] ?? String(value);
  }
  return displayValue(value, "Unknown");
}

function AudioPreview({ handleId, reference }: { handleId: string; reference: MediaReference }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (url) return <audio controls preload="metadata" src={url} className="h-9 max-w-full" />;
  return (
    <button
      type="button"
      className={secondaryButtonClassName}
      onClick={() =>
        void datasetClient.media(handleId, reference).then(
          (media) => {
            setUrl(
              URL.createObjectURL(
                new Blob([Uint8Array.from(media.bytes).buffer], { type: media.mimeType }),
              ),
            );
          },
          (reason: unknown) =>
            setError(reason instanceof Error ? reason.message : "Audio could not be read."),
        )
      }
    >
      <PlayIcon className="size-4" /> {error ?? "Load audio"}
    </button>
  );
}

export default function DatasetInstaller(): JSX.Element {
  const [datasetId, setDatasetId] = useState("google/fleurs");
  const [inspection, setInspection] = useState<DatasetInspection>();
  const [configuration, setConfiguration] = useState("");
  const [selectedSplits, setSelectedSplits] = useState<Set<string>>(new Set());
  const [installed, setInstalled] = useState<InstalledDataset[]>([]);
  const [examples, setExamples] = useState<DatasetExample[]>([]);
  const [previewHandle, setPreviewHandle] = useState<string>();
  const [previewFeatures, setPreviewFeatures] = useState<FeatureSchema>({});
  const [progress, setProgress] = useState<{ completedBytes: number; totalBytes: number }>();
  const [busy, setBusy] = useState<"inspect" | "install">();
  const [error, setError] = useState<string>();
  const operation = useRef<AbortController | undefined>(undefined);

  const configurationInfo = inspection?.configurations.find((item) => item.name === configuration);
  const selectedSize = useMemo(
    () =>
      configurationInfo?.splits
        .filter((split) => selectedSplits.has(split.name))
        .reduce((sum, split) => sum + split.size, 0) ?? 0,
    [configurationInfo, selectedSplits],
  );

  const refreshInstalled = () =>
    void datasetClient.list().then(setInstalled, () => setInstalled([]));
  useEffect(refreshInstalled, []);
  useEffect(
    () => () => {
      operation.current?.abort();
      if (previewHandle) void datasetClient.close(previewHandle);
    },
    [previewHandle],
  );

  const inspect = async () => {
    const controller = new AbortController();
    operation.current = controller;
    setBusy("inspect");
    setError(undefined);
    setInspection(undefined);
    try {
      const result = await datasetClient.inspect(datasetId, "main", controller.signal);
      setInspection(result);
      const first = result.configurations[0];
      setConfiguration(first?.name ?? "");
      setSelectedSplits(new Set(first?.splits[0] ? [first.splits[0].name] : []));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dataset inspection failed.");
    } finally {
      setBusy(undefined);
      operation.current = undefined;
    }
  };

  const install = async () => {
    if (!inspection || selectedSplits.size === 0) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy("install");
    setError(undefined);
    try {
      await datasetClient.install(inspection, configuration, [...selectedSplits], {
        signal: controller.signal,
        onProgress: ({ completedBytes, totalBytes }) => setProgress({ completedBytes, totalBytes }),
      });
      refreshInstalled();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dataset installation failed.");
    } finally {
      setBusy(undefined);
      setProgress(undefined);
      operation.current = undefined;
    }
  };

  const preview = async (item: InstalledDataset) => {
    if (previewHandle) await datasetClient.close(previewHandle);
    const opened = await datasetClient.open(selectionOf(item));
    setPreviewHandle(opened.handleId);
    setPreviewFeatures(opened.features);
    setExamples(await datasetClient.next(opened.handleId, 6));
  };

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <section className="rounded-[28px] border border-memora-border bg-memora-surface px-5 py-6 shadow-sm-soft sm:px-7">
        <div className="max-w-2xl">
          <h2 className="font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
            Hub datasets
          </h2>
          <p className="mt-2 text-sm leading-6 text-memora-text-muted">
            Inspect a public Parquet dataset at an immutable revision, then keep selected splits in
            OPFS for offline work.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Hugging Face dataset ID</span>
            <input
              value={datasetId}
              onChange={(event) => setDatasetId(event.target.value)}
              className={inputClassName}
              placeholder="organization/dataset"
            />
          </label>
          <button
            type="button"
            className={primaryButtonClassName}
            disabled={busy !== undefined || !datasetId.includes("/")}
            onClick={() => void inspect()}
          >
            {busy === "inspect" ? "Inspecting…" : "Inspect dataset"}
          </button>
          {busy ? (
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={() => operation.current?.abort()}
            >
              <PauseIcon className="size-4" /> Cancel
            </button>
          ) : null}
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-memora-warning-border bg-memora-warning-surface px-3.5 py-3 text-sm text-memora-warning-text"
          >
            {error}
          </p>
        ) : null}

        {inspection ? (
          <div className="mt-7 border-t border-memora-border pt-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <label className="min-w-56 text-sm font-medium text-memora-text">
                Configuration
                <select
                  className={`${inputClassName} mt-2`}
                  value={configuration}
                  onChange={(event) => {
                    setConfiguration(event.target.value);
                    const first = inspection.configurations.find(
                      (item) => item.name === event.target.value,
                    )?.splits[0];
                    setSelectedSplits(new Set(first ? [first.name] : []));
                  }}
                >
                  {inspection.configurations.map((item) => (
                    <option key={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <div className="text-right text-xs leading-5 text-memora-text-soft">
                <p>Revision</p>
                <p
                  className="max-w-64 truncate font-medium text-memora-text"
                  title={inspection.revision}
                >
                  {inspection.revision}
                </p>
              </div>
            </div>
            <div className="mt-5 divide-y divide-memora-border overflow-hidden rounded-2xl border border-memora-border">
              {configurationInfo?.splits.map((split) => (
                <label
                  key={split.name}
                  className="flex cursor-pointer items-center gap-4 bg-memora-surface px-4 py-3.5 hover:bg-memora-hover-strong"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-memora-olive"
                    checked={selectedSplits.has(split.name)}
                    onChange={(event) =>
                      setSelectedSplits((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(split.name);
                        else next.delete(split.name);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-memora-text">{split.name}</span>
                    <span className="mt-0.5 block text-xs text-memora-text-soft">
                      {split.examples === undefined
                        ? "Unknown example count"
                        : `${split.examples.toLocaleString()} examples`}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-memora-text-muted">
                    {formatBytes(split.size)}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-memora-text-muted">
                Selected:{" "}
                <span className="font-medium text-memora-text">{formatBytes(selectedSize)}</span>
              </p>
              <button
                type="button"
                className={primaryButtonClassName}
                disabled={busy !== undefined || selectedSplits.size === 0}
                onClick={() => void install()}
              >
                <DownloadSimpleIcon className="size-4" />
                {busy === "install" ? "Installing…" : "Install to OPFS"}
              </button>
            </div>
            {progress ? (
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-memora-surface-muted">
                  <div
                    className="h-full bg-memora-olive transition-[width] duration-150"
                    style={{
                      width: `${Math.min(100, (progress.completedBytes / progress.totalBytes) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs tabular-nums text-memora-text-soft">
                  {formatBytes(progress.completedBytes)} of {formatBytes(progress.totalBytes)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {examples.length > 0 && previewHandle ? (
          <div className="mt-8 border-t border-memora-border pt-6">
            <h3 className="text-sm font-semibold text-memora-text">Preview</h3>
            <div className="mt-3 divide-y divide-memora-border">
              {examples.map((example, index) => (
                <div
                  key={displayValue(example.id, String(index))}
                  className="grid gap-3 py-4 sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <p className="text-sm leading-6 text-memora-text">
                      {displayValue(example.transcription ?? example.text, "No text field")}
                    </p>
                    <p className="mt-1 text-xs text-memora-text-soft">
                      Label {displayLabel(example.lang_id ?? example.label, previewFeatures)}
                    </p>
                  </div>
                  {example.audio && typeof example.audio === "object" && "type" in example.audio ? (
                    <AudioPreview
                      handleId={previewHandle}
                      reference={example.audio as MediaReference}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <aside className="self-start rounded-[28px] border border-memora-border bg-memora-surface-soft px-5 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          <HardDrivesIcon className="size-4 text-memora-olive" />
          <h2 className="text-sm font-semibold text-memora-text">Installed splits</h2>
        </div>
        {installed.length === 0 ? (
          <div className="mt-5 border-t border-dashed border-memora-border-soft pt-5">
            <p className="text-sm leading-6 text-memora-text-muted">
              Installed splits appear here and remain available without a network connection.
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-memora-border">
            {installed.map((item) => (
              <div
                key={`${item.datasetId}:${item.revision}:${item.configuration}:${item.split}`}
                className="py-4"
              >
                <p className="truncate text-sm font-medium text-memora-text" title={item.datasetId}>
                  {item.datasetId}
                </p>
                <p className="mt-1 text-xs text-memora-text-soft">
                  {item.configuration} / {item.split} · {formatBytes(item.size)}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={() =>
                      void preview(item).catch((reason: unknown) =>
                        setError(reason instanceof Error ? reason.message : "Preview failed."),
                      )
                    }
                  >
                    <DatabaseIcon className="size-4" /> Preview
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.configuration} ${item.split}`}
                    className={secondaryButtonClassName}
                    onClick={() =>
                      void datasetClient
                        .delete(selectionOf(item))
                        .then(refreshInstalled, (reason: unknown) =>
                          setError(reason instanceof Error ? reason.message : "Delete failed."),
                        )
                    }
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
