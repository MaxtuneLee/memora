import {
  FileTextIcon,
  ImageIcon,
  MicrophoneIcon,
  VideoCameraIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { RefObject } from "react";

import { AudioPlayer } from "@/components/library/AudioPlayer";
import { VideoPlayer } from "@/components/library/VideoPlayer";
import { formatBytes } from "@/lib/format";
import type { RecordingItem, RecordingWord } from "@/types/library";

interface RecordingPreviewSurfaceProps {
  recording: RecordingItem;
  mediaReadyToken: number;
  transcriptWords: RecordingWord[];
  currentTimeRef: RefObject<number>;
  seekRef: RefObject<number | null>;
  onMediaReady: () => void;
}

const FILE_ICONS: Record<RecordingItem["type"], Icon> = {
  audio: MicrophoneIcon,
  video: VideoCameraIcon,
  image: ImageIcon,
  document: FileTextIcon,
};

export const RecordingPreviewSurface = ({
  recording,
  mediaReadyToken,
  transcriptWords,
  currentTimeRef,
  seekRef,
  onMediaReady,
}: RecordingPreviewSurfaceProps) => {
  const Icon = FILE_ICONS[recording.type];

  return (
    <section data-surface="transcript-detail-preview" className="flex self-start flex-col py-5">
      <div className="flex items-center justify-between gap-3 pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="memora-gentle-float flex size-8 items-center justify-center text-[var(--color-memora-text-soft)]">
            <Icon className="size-5" weight="duotone" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-memora-text-soft)]">
              Source
            </p>
            <p className="truncate text-sm font-medium text-[var(--color-memora-text)]">
              {recording.type} · {formatBytes(recording.sizeBytes)}
            </p>
          </div>
        </div>
      </div>

      <div>
        {recording.type === "video" ? (
          <div className="memora-surface-glow overflow-hidden rounded-[1.5rem] bg-black/90">
            <VideoPlayer
              videoUrl={recording.audioUrl}
              readyToken={mediaReadyToken}
              duration={recording.durationSec || 0}
              onReady={onMediaReady}
              transcriptWords={transcriptWords}
              timeRef={currentTimeRef}
              seekRef={seekRef}
            />
          </div>
        ) : null}

        {recording.type === "audio" ? (
          <div className="memora-surface-glow rounded-[1.5rem] bg-[var(--color-memora-surface-soft)]">
            <AudioPlayer
              audioUrl={recording.audioUrl}
              audioReadyToken={mediaReadyToken}
              duration={recording.durationSec || 0}
              handleAudioReady={onMediaReady}
              timeRef={currentTimeRef}
              seekRef={seekRef}
            />
          </div>
        ) : null}

        {recording.type === "image" ? (
          <div className="memora-surface-glow flex min-h-[20rem] items-center justify-center overflow-hidden rounded-[1.5rem] bg-[var(--color-memora-rail)] p-4">
            {recording.audioUrl ? (
              <img
                src={recording.audioUrl}
                alt={recording.name}
                className="max-h-full w-full object-contain transition-transform duration-500 ease-[var(--ease-out-quart)] hover:scale-[1.01]"
                loading="lazy"
              />
            ) : (
              <div className="text-sm text-[var(--color-memora-text-muted)]">Loading image...</div>
            )}
          </div>
        ) : null}

        {recording.type === "document" ? (
          <div className="memora-surface-glow flex min-h-[20rem] items-center justify-center rounded-[1.5rem] bg-[var(--color-memora-surface-soft)] p-6">
            <div className="max-w-sm text-center">
              <span className="memora-gentle-float mx-auto flex size-14 items-center justify-center text-[var(--color-memora-text-soft)]">
                <FileTextIcon className="size-7" weight="duotone" />
              </span>
              <p className="mt-4 text-sm font-medium text-[var(--color-memora-text)]">
                Document preview is kept minimal here.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-memora-text-muted)]">
                Focus this page on transcript work. File detail stays lightweight.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
