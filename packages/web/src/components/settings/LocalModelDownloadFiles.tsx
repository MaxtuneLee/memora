import { CheckIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";

import type { LocalModelDownloadState } from "@/lib/local-model/downloadState";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 10, marginTop: 12 },
  file: { display: "flex", flexDirection: "column", gap: 6 },
  header: {
    alignItems: "center",
    display: "flex",
    fontSize: 12,
    gap: 12,
    justifyContent: "space-between",
  },
  name: {
    color: "var(--color-memora-text-muted)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  value: {
    alignItems: "center",
    color: "var(--color-memora-text-soft)",
    display: "flex",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    gap: 4,
  },
  check: { color: "var(--color-memora-olive)", height: 12, width: 12 },
  track: {
    backgroundColor: "var(--color-memora-border-soft)",
    borderRadius: 9999,
    height: 6,
    overflow: "hidden",
  },
  indicator: {
    borderRadius: 9999,
    height: "100%",
    transformOrigin: "left",
    transition: "transform 300ms",
  },
  complete: { backgroundColor: "var(--color-memora-olive)" },
  downloading: { backgroundColor: "#5f8fcb" },
});

interface LocalModelDownloadFilesProps {
  state?: LocalModelDownloadState;
  className?: string;
}

const getProgress = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
};

const formatBytes = (bytes: number | undefined): string | null => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  const value = bytes >= 1024 * 1024 * 1024 ? bytes / (1024 * 1024 * 1024) : bytes / (1024 * 1024);
  const unit = bytes >= 1024 * 1024 * 1024 ? "GB" : "MB";
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
};

export default function LocalModelDownloadFiles({
  state,
  className,
}: LocalModelDownloadFilesProps) {
  const files = state?.files ?? [];
  if (state?.status !== "downloading" || files.length === 0) {
    return null;
  }

  return (
    <div className={`${stylex.props(styles.root).className} ${className ?? ""}`}>
      {files.map((fileState) => {
        const progress = getProgress(fileState.progress);
        const isComplete = progress >= 100;

        return (
          <div key={fileState.file} {...stylex.props(styles.file)}>
            <div {...stylex.props(styles.header)}>
              <span {...stylex.props(styles.name)}>{fileState.file}</span>
              <span {...stylex.props(styles.value)}>
                {isComplete ? <CheckIcon className={stylex.props(styles.check).className} /> : null}
                {formatBytes(fileState.total) ? `${formatBytes(fileState.total)} · ` : ""}
                {Math.round(progress)}%
              </span>
            </div>
            <div {...stylex.props(styles.track)}>
              <div
                {...stylex.props(
                  styles.indicator,
                  isComplete ? styles.complete : styles.downloading,
                )}
                style={{ transform: `scaleX(${progress / 100})` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
