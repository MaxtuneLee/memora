import {
  CheckCircleIcon,
  ClockIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";

import type { DesktopFileIndexStatus } from "@/types/desktop";

interface IndexStatusMeta {
  label: string;
  description: string;
  tone: "default" | "olive" | "warning";
}

const INDEX_STATUS_META: Record<DesktopFileIndexStatus, IndexStatusMeta> = {
  pending: {
    label: "Pending",
    description: "Waiting to be indexed",
    tone: "default",
  },
  processing: {
    label: "Indexing",
    description: "Indexing this file",
    tone: "olive",
  },
  indexed: {
    label: "Indexed",
    description: "Available in content search",
    tone: "olive",
  },
  failed: {
    label: "Index failed",
    description: "Open details to review the index status",
    tone: "warning",
  },
};

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });
const styles = stylex.create({
  button: {
    alignItems: "center",
    border: "1px solid",
    borderRadius: 9999,
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    display: "flex",
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: -4,
    bottom: -4,
    transition: "color 150ms, background-color 150ms",
    width: 20,
    zIndex: 2,
    ":focus-visible": { outline: "2px solid var(--color-memora-olive-soft)", outlineOffset: 2 },
  },
  compactButton: { height: 18, width: 18 },
  label: {
    alignItems: "center",
    border: "1px solid",
    borderRadius: 9999,
    display: "inline-flex",
    fontSize: 11,
    fontWeight: 500,
    gap: 6,
    height: 24,
    paddingInline: 8,
  },
  default: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    color: "var(--color-memora-text-soft)",
  },
  olive: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-olive-faint)",
    color: "var(--color-memora-olive)",
  },
  warning: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderColor: "var(--color-memora-warning-border)",
    color: "var(--color-memora-warning-text)",
  },
  smallIcon: { height: 10, width: 10 },
  icon: { height: 12, width: 12 },
  spin: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: spin,
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
});

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
    return (
      <SpinnerGapIcon className={`${className ?? ""} ${stylex.props(styles.spin).className}`} />
    );
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
      {...stylex.props(styles.button, compact && styles.compactButton, styles[meta.tone])}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenDetails();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <IndexStatusIcon
        status={status}
        className={stylex.props(compact ? styles.smallIcon : styles.icon).className}
      />
    </button>
  );
}

export function DesktopIndexStatusLabel({ status }: { status: DesktopFileIndexStatus }) {
  const meta = INDEX_STATUS_META[status];

  return (
    <span {...stylex.props(styles.label, styles[meta.tone])}>
      <IndexStatusIcon status={status} className={stylex.props(styles.icon).className} />
      {meta.label}
    </span>
  );
}
