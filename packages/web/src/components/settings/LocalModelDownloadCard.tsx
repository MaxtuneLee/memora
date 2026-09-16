import { ArrowsClockwiseIcon, CheckIcon, TrashIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import LocalModelDownloadFiles from "@/components/settings/LocalModelDownloadFiles";
import { Button } from "@/components/ui/Button";
import type { LocalModelOption } from "@/lib/local-model";
import {
  getLocalModelDownloadedBytes,
  getLocalModelDownloadProgress,
  getLocalModelDownloadTotalBytes,
  type LocalModelDownloadState,
} from "@/lib/local-model/downloadState";

const rotate = stylex.keyframes({
  to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
  card: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded7c9",
    borderRadius: "1.4rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: {
      default: "1.5rem",
      "@media (min-width: 640px)": "1.75rem",
    },
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: "1.25rem",
    justifyContent: "space-between",
  },
  heading: { minWidth: 0 },
  title: {
    color: "#24231f",
    fontSize: "1.125rem",
    fontWeight: 600,
    lineHeight: "1.75rem",
  },
  description: {
    color: "#817b70",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.25rem",
  },
  meta: { marginTop: "0.5rem" },
  cachedSummary: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "0.25rem",
  },
  downloadedBadge: {
    alignItems: "center",
    backgroundColor: "#eef3e2",
    borderRadius: "9999px",
    color: "#5c6c3d",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    gap: "0.375rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.75rem",
  },
  smallIcon: { height: "0.875rem", width: "0.875rem" },
  size: {
    color: "#6f695f",
    fontSize: "0.875rem",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    lineHeight: "1.25rem",
    flexShrink: 0,
  },
  cachedSize: { fontSize: "0.75rem", lineHeight: "1rem" },
  progressTrack: {
    backgroundColor: "#e4e3d9",
    borderRadius: "9999px",
    height: "0.5rem",
    marginTop: "1.75rem",
    overflow: "hidden",
  },
  progressBar: {
    backgroundColor: "#7d8c59",
    borderRadius: "9999px",
    height: "100%",
    transformOrigin: "left",
    transitionDuration: "300ms",
    transitionProperty: "transform",
  },
  progressMeta: {
    alignItems: "center",
    color: "#817b70",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    gap: "1rem",
    justifyContent: "space-between",
    lineHeight: "1.25rem",
    marginTop: "0.75rem",
  },
  tabular: { fontVariantNumeric: "tabular-nums" },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginTop: "1.25rem",
  },
  spin: { animation: `${rotate} 1s linear infinite` },
  files: { marginTop: "1rem" },
  error: {
    color: "var(--color-memora-warning-text)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.75rem",
  },
});

interface LocalModelDownloadCardProps {
  model: LocalModelOption;
  state?: LocalModelDownloadState;
  className?: string;
  title?: string;
  description?: string;
  meta?: ReactNode;
  onDownload: (modelId: string) => void;
  onRefresh?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
}

const getManifestTotalBytes = (model: LocalModelOption): number | undefined => {
  return typeof model.manifest.downloadSizeGB === "number"
    ? model.manifest.downloadSizeGB * 1024 * 1024 * 1024
    : undefined;
};

const formatBytes = (bytes: number | undefined): string => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const value = bytes >= 1024 * 1024 * 1024 ? bytes / (1024 * 1024 * 1024) : bytes / (1024 * 1024);
  const unit = bytes >= 1024 * 1024 * 1024 ? "GB" : "MB";
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
};

export default function LocalModelDownloadCard({
  model,
  state,
  className,
  title,
  description,
  meta,
  onDownload,
  onRefresh,
  onDelete,
}: LocalModelDownloadCardProps) {
  const manifestTotalBytes = getManifestTotalBytes(model);
  const totalBytes = getLocalModelDownloadTotalBytes(state, manifestTotalBytes);
  const downloadedBytes = getLocalModelDownloadedBytes(state, manifestTotalBytes);
  const progress = getLocalModelDownloadProgress(state, manifestTotalBytes);
  const isDownloading = state?.status === "downloading";
  const isCached = state?.status === "cached";
  const isChecking = state?.status === "checking";
  const resolvedTitle = title ?? model.name;
  const resolvedDescription = description ?? model.manifest.modelId;
  const totalSizeLabel = formatBytes(totalBytes);
  const downloadedSizeLabel = formatBytes(downloadedBytes);
  const cachedSizeLabel = formatBytes(state?.cache?.totalBytes ?? manifestTotalBytes);

  return (
    <section className={`${stylex.props(styles.card).className} ${className ?? ""}`}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <h3 {...stylex.props(styles.title)}>{resolvedTitle}</h3>
          <p {...stylex.props(styles.description)}>{resolvedDescription}</p>
          {meta ? <div {...stylex.props(styles.meta)}>{meta}</div> : null}
        </div>
        {isCached ? (
          <div {...stylex.props(styles.cachedSummary)}>
            <div {...stylex.props(styles.downloadedBadge)}>
              <CheckIcon className={stylex.props(styles.smallIcon).className} weight="bold" />
              <span>Downloaded</span>
            </div>
            {cachedSizeLabel ? (
              <span {...stylex.props(styles.size, styles.cachedSize)}>{cachedSizeLabel}</span>
            ) : null}
          </div>
        ) : totalSizeLabel ? (
          <p {...stylex.props(styles.size)}>{totalSizeLabel}</p>
        ) : null}
      </div>

      {!isCached ? (
        <>
          <div {...stylex.props(styles.progressTrack)}>
            <div
              {...stylex.props(styles.progressBar)}
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <div {...stylex.props(styles.progressMeta)}>
            <span {...stylex.props(styles.tabular)}>
              {totalSizeLabel && downloadedSizeLabel
                ? `${downloadedSizeLabel} / ${totalSizeLabel}`
                : (state?.file ?? "Preparing download")}
            </span>
            <span {...stylex.props(styles.tabular)}>{Math.round(progress)}%</span>
          </div>
        </>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          variant="primary"
          type="button"
          onClick={() => onDownload(model.id)}
          disabled={isDownloading || isCached}
        >
          {isCached ? "Ready" : isDownloading ? "Downloading..." : "Download"}
        </Button>
        {onRefresh ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onRefresh(model.id)}
            disabled={isDownloading}
          >
            <ArrowsClockwiseIcon
              className={stylex.props(styles.smallIcon, isChecking && styles.spin).className}
            />
            <span>Refresh</span>
          </Button>
        ) : null}
        {onDelete && isCached ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onDelete(model.id)}
            disabled={isDownloading}
          >
            <TrashIcon className={stylex.props(styles.smallIcon).className} />
            <span>Delete</span>
          </Button>
        ) : null}
      </div>

      <LocalModelDownloadFiles state={state} className={stylex.props(styles.files).className} />
      {state?.status === "error" ? <p {...stylex.props(styles.error)}>{state.error}</p> : null}
    </section>
  );
}
