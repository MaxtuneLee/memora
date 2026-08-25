import {
  CheckCircleIcon,
  ClockIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { cn } from "@/lib/cn";
import type { DesktopFileIndexStatus } from "@/types/desktop";

interface IndexStatusMeta {
  label: string;
  description: string;
  className: string;
}

const INDEX_STATUS_META: Record<DesktopFileIndexStatus, IndexStatusMeta> = {
  pending: {
    label: "Pending",
    description: "Waiting to be indexed",
    className: "border-memora-border bg-memora-surface text-memora-text-soft",
  },
  processing: {
    label: "Indexing",
    description: "Indexing this file",
    className: "border-memora-olive-faint bg-memora-surface text-memora-olive",
  },
  indexed: {
    label: "Indexed",
    description: "Available in content search",
    className: "border-memora-olive-faint bg-memora-surface text-memora-olive",
  },
  failed: {
    label: "Index failed",
    description: "Open details to review the index status",
    className: "border-memora-warning-border bg-memora-warning-surface text-memora-warning-text",
  },
};

export const getDesktopIndexStatusLabel = (status: DesktopFileIndexStatus): string => {
  return INDEX_STATUS_META[status].label;
};

const IndexStatusIcon = ({
  status,
  className,
}: {
  status: DesktopFileIndexStatus;
  className?: string;
}) => {
  if (status === "processing") {
    return <SpinnerGapIcon className={cn(className, "animate-spin motion-reduce:animate-none")} />;
  }
  if (status === "indexed") {
    return <CheckCircleIcon className={className} weight="fill" />;
  }
  if (status === "failed") {
    return <WarningCircleIcon className={className} weight="fill" />;
  }
  return <ClockIcon className={className} weight="fill" />;
};

export function DesktopIndexStatusIcon({
  status,
  compact = false,
  onOpenDetails,
}: {
  status: DesktopFileIndexStatus;
  compact?: boolean;
  onOpenDetails: () => void;
}) {
  const meta = INDEX_STATUS_META[status];

  return (
    <button
      type="button"
      aria-label={`View index details: ${meta.label}`}
      title={meta.description}
      className={cn(
        "absolute -right-1 -bottom-1 z-[2] flex items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-memora-olive-soft",
        compact ? "size-[18px]" : "size-5",
        meta.className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenDetails();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <IndexStatusIcon status={status} className={compact ? "size-2.5" : "size-3"} />
    </button>
  );
}

export function DesktopIndexStatusLabel({ status }: { status: DesktopFileIndexStatus }) {
  const meta = INDEX_STATUS_META[status];

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
        meta.className,
      )}
    >
      <IndexStatusIcon status={status} className="size-3" />
      {meta.label}
    </span>
  );
}
