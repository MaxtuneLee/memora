import { CheckIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/cn";
import type { LocalModelDownloadState } from "@/lib/local-model/downloadState";

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
    <div className={cn("mt-3 space-y-2.5", className)}>
      {files.map((fileState) => {
        const progress = getProgress(fileState.progress);
        const isComplete = progress >= 100;

        return (
          <div key={fileState.file} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-[var(--color-memora-text-muted)]">
                {fileState.file}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums text-[var(--color-memora-text-soft)]">
                {isComplete ? (
                  <CheckIcon className="size-3 text-[var(--color-memora-olive)]" />
                ) : null}
                {formatBytes(fileState.total) ? `${formatBytes(fileState.total)} · ` : ""}
                {Math.round(progress)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-memora-border-soft)]">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  isComplete ? "bg-[var(--color-memora-olive)]" : "bg-[#5f8fcb]",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
