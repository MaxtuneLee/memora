import { CloudArrowDownIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";

import { useFileSyncStatus } from "@/lib/sync/blobSync";
import { tokens } from "../../styles/stylex.stylex";

const RING_RADIUS = 6;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const styles = stylex.create({
  badge: {
    color: tokens.textSoft,
    display: "inline-block",
    flexShrink: 0,
    height: 14,
    marginInlineStart: 4,
    verticalAlign: "-2px",
    width: 14,
  },
  track: { stroke: tokens.border },
  progress: {
    stroke: tokens.olive,
    transition: "stroke-dashoffset 200ms ease-out",
  },
});

/**
 * Shown after a file name when sync is on and the current contents are on another device: a cloud
 * until the file is opened, then a ring while it downloads. Renders nothing for local files.
 */
export default function FileSyncBadge({ fileId }: { fileId: string }) {
  const status = useFileSyncStatus(fileId);
  if (!status) return null;

  if (status.state === "remote") {
    return (
      <CloudArrowDownIcon
        role="img"
        aria-label="Not downloaded"
        weight="bold"
        {...stylex.props(styles.badge)}
      />
    );
  }

  const percent = Math.round(status.progress * 100);
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      strokeWidth={2}
      role="progressbar"
      aria-label="Downloading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      {...stylex.props(styles.badge)}
    >
      <circle cx={8} cy={8} r={RING_RADIUS} {...stylex.props(styles.track)} />
      <circle
        cx={8}
        cy={8}
        r={RING_RADIUS}
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - status.progress)}
        transform="rotate(-90 8 8)"
        {...stylex.props(styles.progress)}
      />
    </svg>
  );
}
