import {
  DatabaseIcon,
  DownloadSimpleIcon,
  HardDrivesIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
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

const styles = stylex.create({
  layout: {
    display: "grid",
    gap: "1.75rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 1280px)": "minmax(0, 1.35fr) minmax(320px, 0.65fr)",
    },
  },
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
  inspectRow: {
    display: "flex",
    flexDirection: { default: "column", "@media (min-width: 640px)": "row" },
    gap: "0.75rem",
    marginTop: "1.5rem",
  },
  grow: { flex: 1, minWidth: 0 },
  srOnly: {
    clip: "rect(0,0,0,0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
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
    outline: "none",
    paddingInline: "0.875rem",
    transition: "border-color 150ms, box-shadow 150ms",
    width: "100%",
    ":focus": {
      borderColor: "var(--color-memora-olive-soft)",
      boxShadow: "0 0 0 2px color-mix(in srgb, var(--color-memora-olive-soft) 30%, transparent)",
    },
  },
  inputSpacing: { marginTop: "0.5rem" },
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
  audio: { height: "2.25rem", maxWidth: "100%" },
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
  section: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "1.75rem",
    paddingTop: "1.5rem",
  },
  configHeader: {
    alignItems: "flex-end",
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
  },
  configLabel: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    minWidth: "14rem",
  },
  revision: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    textAlign: "right",
  },
  revisionValue: {
    color: "var(--color-memora-text)",
    fontWeight: 500,
    maxWidth: "16rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  splitList: {
    borderColor: "var(--color-memora-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: "1.25rem",
    overflow: "hidden",
  },
  split: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-surface)",
      ":hover": "var(--color-memora-hover-strong)",
    },
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    cursor: "pointer",
    display: "flex",
    gap: "1rem",
    paddingBlock: "0.875rem",
    paddingInline: "1rem",
    ":last-child": { borderBottomWidth: 0 },
  },
  checkbox: { accentColor: "var(--color-memora-olive)", height: "1rem", width: "1rem" },
  splitCopy: { flex: 1, minWidth: 0 },
  splitName: {
    color: "var(--color-memora-text)",
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
  },
  splitMeta: {
    color: "var(--color-memora-text-soft)",
    display: "block",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.125rem",
  },
  splitSize: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1.25rem",
  },
  installRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
    marginTop: "1.25rem",
  },
  selectedText: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
  },
  strong: { color: "var(--color-memora-text)", fontWeight: 500 },
  progress: { marginTop: "1rem" },
  progressTrack: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "9999px",
    height: "0.375rem",
    overflow: "hidden",
  },
  progressBar: {
    backgroundColor: "var(--color-memora-olive)",
    height: "100%",
    transition: "width 150ms",
  },
  progressText: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
    marginTop: "0.5rem",
  },
  preview: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "2rem",
    paddingTop: "1.5rem",
  },
  sectionTitle: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
  },
  examples: { marginTop: "0.75rem" },
  example: {
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "minmax(0,1fr) auto",
    },
    paddingBlock: "1rem",
    ":last-child": { borderBottomWidth: 0 },
  },
  exampleCopy: { minWidth: 0 },
  exampleText: { color: "var(--color-memora-text)", fontSize: "0.875rem", lineHeight: "1.5rem" },
  exampleLabel: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.25rem",
  },
  aside: {
    alignSelf: "start",
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "28px",
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: "1.5rem",
    paddingInline: { default: "1.25rem", "@media (min-width: 640px)": "1.5rem" },
  },
  asideHeader: { alignItems: "center", display: "flex", gap: "0.5rem" },
  oliveIcon: { color: "var(--color-memora-olive)", height: "1rem", width: "1rem" },
  emptyInstalled: {
    borderTopColor: "var(--color-memora-border-soft)",
    borderTopStyle: "dashed",
    borderTopWidth: 1,
    marginTop: "1.25rem",
    paddingTop: "1.25rem",
  },
  emptyText: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
  },
  installedList: { marginTop: "1rem" },
  installedItem: {
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBlock: "1rem",
    ":last-child": { borderBottomWidth: 0 },
  },
  installedName: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  installedMeta: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.25rem",
  },
  installedActions: { display: "flex", gap: "0.5rem", marginTop: "0.75rem" },
});

function selectionOf(installed: InstalledDataset): DatasetSelection {
  return {
    datasetId: installed.datasetId,
    revision: installed.revision,
    configuration: installed.configuration,
    split: installed.split,
  };
}

function preferredConfiguration<T extends { name: string }>(configurations: T[]): T | undefined {
  return configurations.find((item) => /^en([_-]|$)/iu.test(item.name)) ?? configurations[0];
}

// Falls back to the smallest split by size (already known for free from the Hub file
// listing) rather than the first alphabetically, so a dataset without a "test" split
// never defaults to auto-resolving a large "train" split's Parquet footers.
function preferredSplit<T extends { name: string; size: number }>(splits: T[]): T | undefined {
  return (
    splits.find((item) => item.name === "test") ?? [...splits].sort((a, b) => a.size - b.size)[0]
  );
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
  if (url)
    return (
      <audio
        controls
        preload="metadata"
        src={url}
        className={stylex.props(styles.audio).className}
      />
    );
  return (
    <button
      type="button"
      className={stylex.props(styles.button, styles.secondaryButton).className}
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
      <PlayIcon className={stylex.props(styles.icon).className} /> {error ?? "Load audio"}
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

  // Example counts and features are only known once a split is installed or explicitly
  // resolved; resolving on demand keeps inspection itself from touching ~100 configs' worth
  // of Parquet footers when the user only cares about the one they selected.
  const resolveSplit = (base: DatasetInspection, configurationName: string, splitName: string) => {
    const target = base.configurations
      .find((item) => item.name === configurationName)
      ?.splits.find((item) => item.name === splitName);
    if (!target || target.examples !== undefined) return;
    void datasetClient.resolveSplit(base, configurationName, splitName).then(
      (resolved) => {
        const resolvedSplit = resolved.configurations
          .find((item) => item.name === configurationName)
          ?.splits.find((item) => item.name === splitName);
        if (!resolvedSplit) return;
        // Merge into whatever state is current, not the snapshot this call started from,
        // so concurrent resolves for different splits don't clobber each other.
        setInspection((current) =>
          current?.datasetId !== resolved.datasetId || current.revision !== resolved.revision
            ? current
            : {
                ...current,
                configurations: current.configurations.map((item) =>
                  item.name !== configurationName
                    ? item
                    : {
                        ...item,
                        splits: item.splits.map((candidate) =>
                          candidate.name === splitName ? resolvedSplit : candidate,
                        ),
                      },
                ),
              },
        );
      },
      () => undefined,
    );
  };

  const selectDefaultSplit = (base: DatasetInspection, configurationName: string) => {
    const target = base.configurations.find((item) => item.name === configurationName);
    const split = target ? preferredSplit(target.splits) : undefined;
    setSelectedSplits(new Set(split ? [split.name] : []));
    if (split) resolveSplit(base, configurationName, split.name);
  };

  const inspect = async () => {
    const controller = new AbortController();
    operation.current = controller;
    setBusy("inspect");
    setError(undefined);
    setInspection(undefined);
    try {
      const result = await datasetClient.inspect(datasetId, "main", controller.signal);
      setInspection(result);
      const preferred = preferredConfiguration(result.configurations);
      setConfiguration(preferred?.name ?? "");
      if (preferred) selectDefaultSplit(result, preferred.name);
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
    <div {...stylex.props(styles.layout)}>
      <section {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.intro)}>
          <h2 {...stylex.props(styles.title)}>Hub datasets</h2>
          <p {...stylex.props(styles.description)}>
            Inspect a public Parquet dataset at an immutable revision, then keep selected splits in
            OPFS for offline work.
          </p>
        </div>
        <div {...stylex.props(styles.inspectRow)}>
          <label {...stylex.props(styles.grow)}>
            <span {...stylex.props(styles.srOnly)}>Hugging Face dataset ID</span>
            <input
              value={datasetId}
              onChange={(event) => setDatasetId(event.target.value)}
              className={stylex.props(styles.input).className}
              placeholder="organization/dataset"
            />
          </label>
          <button
            type="button"
            className={stylex.props(styles.button, styles.primaryButton).className}
            disabled={busy !== undefined || !datasetId.includes("/")}
            onClick={() => void inspect()}
          >
            {busy === "inspect" ? "Inspecting…" : "Inspect dataset"}
          </button>
          {busy ? (
            <button
              type="button"
              className={stylex.props(styles.button, styles.secondaryButton).className}
              onClick={() => operation.current?.abort()}
            >
              <PauseIcon className={stylex.props(styles.icon).className} /> Cancel
            </button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className={stylex.props(styles.error).className}>
            {error}
          </p>
        ) : null}

        {inspection ? (
          <div {...stylex.props(styles.section)}>
            <div {...stylex.props(styles.configHeader)}>
              <label {...stylex.props(styles.configLabel)}>
                Configuration
                <select
                  className={stylex.props(styles.input, styles.inputSpacing).className}
                  value={configuration}
                  onChange={(event) => {
                    setConfiguration(event.target.value);
                    selectDefaultSplit(inspection, event.target.value);
                  }}
                >
                  {inspection.configurations.map((item) => (
                    <option key={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <div {...stylex.props(styles.revision)}>
                <p>Revision</p>
                <p
                  className={stylex.props(styles.revisionValue).className}
                  title={inspection.revision}
                >
                  {inspection.revision}
                </p>
              </div>
            </div>
            <div {...stylex.props(styles.splitList)}>
              {configurationInfo?.splits.map((split) => (
                <label key={split.name} className={stylex.props(styles.split).className}>
                  <input
                    type="checkbox"
                    className={stylex.props(styles.checkbox).className}
                    checked={selectedSplits.has(split.name)}
                    onChange={(event) => {
                      setSelectedSplits((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(split.name);
                        else next.delete(split.name);
                        return next;
                      });
                      if (event.target.checked) resolveSplit(inspection, configuration, split.name);
                    }}
                  />
                  <span {...stylex.props(styles.splitCopy)}>
                    <span {...stylex.props(styles.splitName)}>{split.name}</span>
                    <span {...stylex.props(styles.splitMeta)}>
                      {split.examples === undefined
                        ? "Unknown example count"
                        : `${split.examples.toLocaleString()} examples`}
                    </span>
                  </span>
                  <span {...stylex.props(styles.splitSize)}>{formatBytes(split.size)}</span>
                </label>
              ))}
            </div>
            <div {...stylex.props(styles.installRow)}>
              <p {...stylex.props(styles.selectedText)}>
                Selected: <span {...stylex.props(styles.strong)}>{formatBytes(selectedSize)}</span>
              </p>
              <button
                type="button"
                className={stylex.props(styles.button, styles.primaryButton).className}
                disabled={busy !== undefined || selectedSplits.size === 0}
                onClick={() => void install()}
              >
                <DownloadSimpleIcon className={stylex.props(styles.icon).className} />
                {busy === "install" ? "Installing…" : "Install to OPFS"}
              </button>
            </div>
            {progress ? (
              <div {...stylex.props(styles.progress)}>
                <div {...stylex.props(styles.progressTrack)}>
                  <div
                    {...stylex.props(styles.progressBar)}
                    style={{
                      width: `${Math.min(100, (progress.completedBytes / progress.totalBytes) * 100)}%`,
                    }}
                  />
                </div>
                <p {...stylex.props(styles.progressText)}>
                  {formatBytes(progress.completedBytes)} of {formatBytes(progress.totalBytes)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {examples.length > 0 && previewHandle ? (
          <div {...stylex.props(styles.preview)}>
            <h3 {...stylex.props(styles.sectionTitle)}>Preview</h3>
            <div {...stylex.props(styles.examples)}>
              {examples.map((example, index) => (
                <div
                  key={displayValue(example.id, String(index))}
                  className={stylex.props(styles.example).className}
                >
                  <div {...stylex.props(styles.exampleCopy)}>
                    <p {...stylex.props(styles.exampleText)}>
                      {displayValue(example.transcription ?? example.text, "No text field")}
                    </p>
                    <p {...stylex.props(styles.exampleLabel)}>
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

      <aside {...stylex.props(styles.aside)}>
        <div {...stylex.props(styles.asideHeader)}>
          <HardDrivesIcon className={stylex.props(styles.oliveIcon).className} />
          <h2 {...stylex.props(styles.sectionTitle)}>Installed splits</h2>
        </div>
        {installed.length === 0 ? (
          <div {...stylex.props(styles.emptyInstalled)}>
            <p {...stylex.props(styles.emptyText)}>
              Installed splits appear here and remain available without a network connection.
            </p>
          </div>
        ) : (
          <div {...stylex.props(styles.installedList)}>
            {installed.map((item) => (
              <div
                key={`${item.datasetId}:${item.revision}:${item.configuration}:${item.split}`}
                className={stylex.props(styles.installedItem).className}
              >
                <p {...stylex.props(styles.installedName)} title={item.datasetId}>
                  {item.datasetId}
                </p>
                <p {...stylex.props(styles.installedMeta)}>
                  {item.configuration} / {item.split} · {formatBytes(item.size)}
                </p>
                <div {...stylex.props(styles.installedActions)}>
                  <button
                    type="button"
                    className={stylex.props(styles.button, styles.secondaryButton).className}
                    onClick={() =>
                      void preview(item).catch((reason: unknown) =>
                        setError(reason instanceof Error ? reason.message : "Preview failed."),
                      )
                    }
                  >
                    <DatabaseIcon className={stylex.props(styles.icon).className} /> Preview
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.configuration} ${item.split}`}
                    className={stylex.props(styles.button, styles.secondaryButton).className}
                    onClick={() => {
                      void datasetClient
                        .delete(selectionOf(item))
                        .then(refreshInstalled, (reason: unknown) =>
                          setError(reason instanceof Error ? reason.message : "Delete failed."),
                        );
                    }}
                  >
                    <TrashIcon className={stylex.props(styles.icon).className} />
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
