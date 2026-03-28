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
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactElement } from "react";
import { Link } from "react-router";

import { formatDateTime, formatDuration } from "@/lib/format";
import type { RecordingItem } from "@/types/library";

import type { TranscriptHistoryRowState } from "./transcriptLandingState";

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
    case "Diagnostics available":
      return {
        icon: WarningCircleIcon,
        tone: "border-[var(--color-memora-warning-border)] bg-[var(--color-memora-warning-surface)] text-[var(--color-memora-warning-text)]",
      };
    case "Transcript ready":
      return {
        icon: SparkleIcon,
        tone: "border-[color-mix(in_srgb,var(--color-memora-olive-soft)_38%,var(--color-memora-border-soft))] bg-[color-mix(in_srgb,var(--color-memora-olive-soft)_10%,var(--color-memora-surface-soft))] text-[color-mix(in_srgb,var(--color-memora-olive)_82%,var(--color-memora-text))]",
      };
    default:
      return {
        icon: FileTextIcon,
        tone: "border-[var(--color-memora-border-soft)] bg-[var(--color-memora-surface-soft)] text-[var(--color-memora-text-muted)]",
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
      className="border-t border-[#ece5d9] first:border-t-0"
    >
      <div className="group grid gap-4 px-5 py-4 transition-[background-color] duration-300 ease-[var(--ease-out-quart)] hover:bg-[#fcfaf5] sm:grid-cols-[minmax(0,1.4fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={`/transcript/file/${recording.id}`}
              className="truncate text-[15px] font-semibold text-memora-text transition-[color] duration-300 ease-[var(--ease-out-quart)] hover:text-[#4d5737]"
            >
              {state.title}
            </Link>
            <span
              data-slot="status"
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none font-medium transition-[background-color,border-color,color] duration-300 ease-[var(--ease-out-quart)] ${statusPresentation.tone}`}
            >
              <StatusIcon className="size-3 shrink-0 self-center" weight="fill" />
              <span className="leading-none">{state.status}</span>
            </span>
          </div>

          <p
            data-slot="preview"
            className="mt-2 line-clamp-2 text-sm leading-6 text-[#716c64] text-pretty"
          >
            {state.preview}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8f897d]">
            <span data-slot="type" className="inline-flex items-center gap-1.5">
              <TypeIcon
                className="size-3.5 text-[var(--color-memora-text-soft)]"
                weight="duotone"
              />
              {state.typeLabel}
            </span>
            {state.showDuration ? (
              <span data-slot="duration" className="inline-flex items-center gap-1.5">
                <ClockIcon className="size-3.5 text-[var(--color-memora-text-soft)]" />
                {formatDuration(state.durationSec ?? 0)}
              </span>
            ) : null}
            <span data-slot="timestamp" className="inline-flex items-center gap-1.5">
              <CalendarBlankIcon className="size-3.5 text-[var(--color-memora-text-soft)]" />
              {formatDateTime(state.timestamp)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:justify-self-end">
          <button
            type="button"
            onClick={() => onDelete(recording)}
            className="memora-interactive inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-medium text-[#8a6455] transition-colors hover:bg-[#fdf6f1] hover:text-[#7b4f39]"
          >
            <TrashIcon className="size-3.5" />
            Delete
          </button>
          <Link
            to={`/transcript/file/${recording.id}`}
            className="memora-interactive group inline-flex min-h-10 items-center gap-1 rounded-full border border-[#e6dfd1] bg-[#fffdfa] px-3 text-xs font-semibold text-memora-text transition-[background-color,border-color,color,transform] hover:bg-[#faf7f0]"
          >
            Open
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
