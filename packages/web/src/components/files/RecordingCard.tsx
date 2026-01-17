import { Button } from "@base-ui/react/button";
import {
  TrashIcon,
  ArrowRightIcon,
  MicrophoneIcon,
} from "@phosphor-icons/react";
import { Link } from "react-router";
import type { RecordingItem } from "../../lib/files";
import { formatDateTime, formatDuration } from "../../lib/format";

interface RecordingCardProps {
  recording: RecordingItem;
  onDelete: (recording: RecordingItem) => void;
}

export const RecordingCard = ({ recording, onDelete }: RecordingCardProps) => {
  const preview = recording.transcriptPreview?.trim() || "No transcript yet.";

  return (
    <Link
      to={`/transcript/file/${recording.id}`}
      className="group relative flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
    >
      <div className="flex items-start justify-between">
        <div className="flex size-8 items-center justify-center rounded-sm bg-zinc-50 text-zinc-400 group-hover:text-zinc-600">
          <span className="text-xs font-semibold">
            <MicrophoneIcon size={16} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 tabular-nums">
            {recording.durationSec !== undefined &&
              recording.durationSec !== null &&
              formatDuration(recording.durationSec)}
          </span>
          <Button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(recording);
            }}
            className="rounded p-1 text-zinc-300 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Delete recording"
          >
            <TrashIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div>
        <h3 className="font-medium text-zinc-900 leading-tight">
          {formatDateTime(recording.createdAt)}
        </h3>
        <p className="mt-1 text-sm text-zinc-500 line-clamp-2 text-pretty">
          {preview}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          Audio
        </span>
        <span className="flex items-center gap-1 text-xs text-zinc-400">
          View details
          <ArrowRightIcon className="size-3" />
        </span>
      </div>
    </Link>
  );
};
