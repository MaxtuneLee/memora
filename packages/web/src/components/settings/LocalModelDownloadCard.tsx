import { Button } from "@base-ui/react/button";
import { ArrowsClockwiseIcon, CheckIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import LocalModelDownloadFiles from "@/components/settings/LocalModelDownloadFiles";
import { SETTINGS_SECONDARY_BUTTON_CLASS_NAME } from "@/components/settings/settingsClassNames";
import { cn } from "@/lib/cn";
import type { LocalModelOption } from "@/lib/local-model";
import {
  getLocalModelDownloadedBytes,
  getLocalModelDownloadProgress,
  getLocalModelDownloadTotalBytes,
  type LocalModelDownloadState,
} from "@/lib/local-model/downloadState";

interface LocalModelDownloadCardProps {
  model: LocalModelOption;
  state?: LocalModelDownloadState;
  className?: string;
  title?: string;
  description?: string;
  meta?: ReactNode;
  onDownload: (modelId: string) => void;
  onRefresh?: (modelId: string) => void;
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

  return (
    <section
      className={cn("rounded-[1.4rem] border border-[#ded7c9] bg-[#fffdf8] p-6 sm:p-7", className)}
    >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[#24231f]">{resolvedTitle}</h3>
          <p className="mt-1 text-sm leading-6 text-[#817b70]">{resolvedDescription}</p>
          {meta ? <div className="mt-2">{meta}</div> : null}
        </div>
        {isCached ? (
          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#eef3e2] px-3 py-1 text-sm font-semibold text-[#5c6c3d]">
            <CheckIcon className="size-3.5" weight="bold" />
            <span>Downloaded</span>
          </div>
        ) : totalSizeLabel ? (
          <p className="shrink-0 text-sm font-semibold tabular-nums text-[#6f695f]">
            {totalSizeLabel}
          </p>
        ) : null}
      </div>

      {!isCached ? (
        <>
          <div className="mt-7 h-2 overflow-hidden rounded-full bg-[#e4e3d9]">
            <div
              className="h-full rounded-full bg-[#7d8c59] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 text-sm font-semibold text-[#817b70]">
            <span className="tabular-nums">
              {totalSizeLabel && downloadedSizeLabel
                ? `${downloadedSizeLabel} / ${totalSizeLabel}`
                : (state?.file ?? "Preparing download")}
            </span>
            <span className="tabular-nums">{Math.round(progress)}%</span>
          </div>
        </>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onDownload(model.id)}
          disabled={isDownloading || isCached}
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-memora-olive px-4 text-xs font-semibold text-[#fffdf8] transition hover:bg-[#a8af90] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isCached ? "Ready" : isDownloading ? "Downloading..." : "Download"}
        </button>
        {onRefresh ? (
          <Button
            type="button"
            onClick={() => onRefresh(model.id)}
            disabled={isDownloading}
            className={SETTINGS_SECONDARY_BUTTON_CLASS_NAME}
          >
            <ArrowsClockwiseIcon className={cn("size-3.5", isChecking ? "animate-spin" : "")} />
            <span>Refresh</span>
          </Button>
        ) : null}
      </div>

      <LocalModelDownloadFiles state={state} className="mt-4" />
      {state?.status === "error" ? (
        <p className="mt-3 text-sm text-[var(--color-memora-warning-text)]">{state.error}</p>
      ) : null}
    </section>
  );
}
