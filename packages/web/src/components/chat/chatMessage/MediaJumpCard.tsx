import { MicrophoneIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { Link } from "react-router";

import { formatDuration } from "@/lib/format";
import type { MediaJumpCardData } from "@/lib/chat/memoraJump";

export function MediaJumpCard({ jumpCard }: { jumpCard: MediaJumpCardData }) {
  const JumpIcon = jumpCard.mediaType === "video" ? VideoCameraIcon : MicrophoneIcon;

  return (
    <Link
      to={`/transcript/file/${jumpCard.fileId}?seek=${encodeURIComponent(
        String(jumpCard.startSec),
      )}`}
      className="group block rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 transition hover:border-zinc-300 hover:bg-white"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <JumpIcon className="size-3.5" weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-zinc-900">{jumpCard.fileName}</p>
            <span className="shrink-0 text-[11px] font-medium text-zinc-500">
              {formatDuration(jumpCard.startSec)} - {formatDuration(jumpCard.endSec)}
            </span>
          </div>
          {jumpCard.context && (
            <p className="mt-1 truncate text-xs text-zinc-500">{jumpCard.context}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
