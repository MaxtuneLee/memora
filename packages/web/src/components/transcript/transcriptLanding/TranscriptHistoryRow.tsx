import {
  ArrowRightIcon,
  CalendarBlankIcon,
  ClockIcon,
  FileTextIcon,
  ImageIcon,
  MicrophoneIcon,
  SparkleIcon,
  TrashIcon,
  VideoCameraIcon,
  type Icon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { motion, useReducedMotion } from "motion/react";
import type { ReactElement } from "react";
import { Link } from "react-router";

import { formatDateTime, formatDuration } from "@/lib/format";
import type { RecordingItem } from "@/types/library";

import type { TranscriptHistoryRowState } from "./transcriptLandingState";

const styles = stylex.create({
  root: {
    borderTopColor: "#ece5d9",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    ":first-child": { borderTopWidth: 0 },
  },
  row: {
    display: "grid",
    gap: "1rem",
    paddingBlock: "1rem",
    paddingInline: "1.25rem",
    transitionDuration: "300ms",
    transitionProperty: "background-color",
    transitionTimingFunction: "var(--ease-out-quart)",
    ":hover": { backgroundColor: "#fcfaf5" },
    "@media (min-width: 640px)": {
      alignItems: "flex-start",
      gridTemplateColumns: "minmax(0, 1.4fr) auto",
    },
  },
  content: { minWidth: 0 },
  heading: {
    alignItems: "center",
    columnGap: "0.5rem",
    display: "flex",
    flexWrap: "wrap",
    rowGap: "0.25rem",
  },
  title: {
    color: { default: "var(--color-memora-text)", ":hover": "#4d5737" },
    fontSize: 15,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    transitionDuration: "300ms",
    transitionProperty: "color",
    transitionTimingFunction: "var(--ease-out-quart)",
    whiteSpace: "nowrap",
  },
  status: {
    alignItems: "center",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    fontSize: 11,
    fontWeight: 500,
    gap: "0.25rem",
    lineHeight: 1,
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
    transitionDuration: "300ms",
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: "var(--ease-out-quart)",
  },
  statusReady: {
    backgroundColor:
      "color-mix(in srgb, var(--color-memora-olive-soft) 10%, var(--color-memora-surface-soft))",
    borderColor:
      "color-mix(in srgb, var(--color-memora-olive-soft) 38%, var(--color-memora-border-soft))",
    color: "color-mix(in srgb, var(--color-memora-olive) 82%, var(--color-memora-text))",
  },
  statusDefault: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border-soft)",
    color: "var(--color-memora-text-muted)",
  },
  statusIcon: { alignSelf: "center", flexShrink: 0, height: "0.75rem", width: "0.75rem" },
  statusText: { lineHeight: 1 },
  preview: {
    color: "#716c64",
    display: "-webkit-box",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.5rem",
    overflow: "hidden",
    textWrap: "pretty",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  metadata: {
    alignItems: "center",
    color: "#8f897d",
    columnGap: "0.75rem",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.75rem",
    rowGap: "0.25rem",
  },
  metadataItem: { alignItems: "center", display: "inline-flex", gap: "0.375rem" },
  metadataIcon: { color: "var(--color-memora-text-soft)", height: "0.875rem", width: "0.875rem" },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    "@media (min-width: 640px)": { justifySelf: "flex-end" },
  },
  action: {
    alignItems: "center",
    borderRadius: "9999px",
    display: "inline-flex",
    fontSize: "0.75rem",
    gap: "0.25rem",
    lineHeight: "1rem",
    minHeight: "2.5rem",
    paddingInline: "0.75rem",
    transitionDuration: "150ms",
  },
  deleteAction: {
    backgroundColor: { default: "transparent", ":hover": "#fdf6f1" },
    color: { default: "#8a6455", ":hover": "#7b4f39" },
    fontWeight: 500,
    transitionProperty: "color, background-color",
  },
  openAction: {
    backgroundColor: { default: "#fffdfa", ":hover": "#faf7f0" },
    borderColor: "#e6dfd1",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text)",
    fontWeight: 600,
    transitionProperty: "background-color, border-color, color, transform",
  },
  actionIcon: { height: "0.875rem", width: "0.875rem" },
});

interface TranscriptHistoryRowProps {
  recording: RecordingItem;
  state: TranscriptHistoryRowState;
  onDelete: (recording: RecordingItem) => void;
}

const ROW_EASE = [0.22, 1, 0.36, 1] as const;
const TYPE_ICONS: Record<RecordingItem["type"], Icon> = {
  audio: MicrophoneIcon,
  video: VideoCameraIcon,
  image: ImageIcon,
  document: FileTextIcon,
};

const getStatusPresentation = (status: TranscriptHistoryRowState["status"]) => {
  switch (status) {
    case "Transcript ready":
      return {
        icon: SparkleIcon,
        style: styles.statusReady,
      };
    default:
      return {
        icon: FileTextIcon,
        style: styles.statusDefault,
      };
  }
};

export function TranscriptHistoryRow({
  recording,
  state,
  onDelete,
}: TranscriptHistoryRowProps): ReactElement {
  const reducedMotion = useReducedMotion() ?? false;
  const statusPresentation = getStatusPresentation(state.status);
  const StatusIcon = statusPresentation.icon;
  const TypeIcon = TYPE_ICONS[recording.type];

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducedMotion ? 0.12 : 0.24,
        ease: ROW_EASE,
      }}
      {...stylex.props(styles.root)}
    >
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.content)}>
          <div {...stylex.props(styles.heading)}>
            <Link to={`/transcript/file/${recording.id}`} {...stylex.props(styles.title)}>
              {state.title}
            </Link>
            <span data-slot="status" {...stylex.props(styles.status, statusPresentation.style)}>
              <StatusIcon {...stylex.props(styles.statusIcon)} weight="fill" />
              <span {...stylex.props(styles.statusText)}>{state.status}</span>
            </span>
          </div>

          <p data-slot="preview" {...stylex.props(styles.preview)}>
            {state.preview}
          </p>

          <div {...stylex.props(styles.metadata)}>
            <span data-slot="type" {...stylex.props(styles.metadataItem)}>
              <TypeIcon {...stylex.props(styles.metadataIcon)} weight="duotone" />
              {state.typeLabel}
            </span>
            {state.showDuration ? (
              <span data-slot="duration" {...stylex.props(styles.metadataItem)}>
                <ClockIcon {...stylex.props(styles.metadataIcon)} />
                {formatDuration(state.durationSec ?? 0)}
              </span>
            ) : null}
            <span data-slot="timestamp" {...stylex.props(styles.metadataItem)}>
              <CalendarBlankIcon {...stylex.props(styles.metadataIcon)} />
              {formatDateTime(state.timestamp)}
            </span>
          </div>
        </div>

        <div {...stylex.props(styles.actions)}>
          <button
            type="button"
            onClick={() => onDelete(recording)}
            className={`memora-interactive ${stylex.props(styles.action, styles.deleteAction).className ?? ""}`}
          >
            <TrashIcon {...stylex.props(styles.actionIcon)} />
            Delete
          </button>
          <Link
            to={`/transcript/file/${recording.id}`}
            className={`memora-interactive ${stylex.props(styles.action, styles.openAction).className ?? ""}`}
          >
            Open
            <ArrowRightIcon {...stylex.props(styles.actionIcon)} />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
