import {
  FileTextIcon,
  ImageIcon,
  MicrophoneIcon,
  VideoCameraIcon,
  type Icon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { RefObject } from "react";

import { AudioPlayer } from "@/components/library/AudioPlayer";
import { VideoPlayer } from "@/components/library/VideoPlayer";
import { formatBytes } from "@/lib/format";
import type { RecordingItem, RecordingWord } from "@/types/library";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    alignSelf: "flex-start",
    display: "flex",
    flexDirection: "column",
    paddingBlock: "1.25rem",
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
    paddingBottom: "1.25rem",
  },
  source: { alignItems: "center", display: "flex", gap: "0.75rem", minWidth: 0 },
  iconFrame: {
    alignItems: "center",
    display: "flex",
    height: "2rem",
    justifyContent: "center",
    color: tokens.textSoft,
    width: "2rem",
  },
  sourceIcon: { height: "1.25rem", width: "1.25rem" },
  sourceDetails: { minWidth: 0 },
  label: { color: tokens.textSoft, fontSize: 11, lineHeight: "1rem" },
  metadata: {
    color: tokens.text,
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  surface: { borderRadius: "1.5rem" },
  videoSurface: { backgroundColor: "rgb(0 0 0 / 0.9)", overflow: "hidden" },
  audioSurface: { backgroundColor: tokens.surfaceSoft },
  centeredSurface: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    minHeight: "20rem",
  },
  imageSurface: {
    backgroundColor: tokens.rail,
    overflow: "hidden",
    padding: "1rem",
  },
  image: {
    maxHeight: "100%",
    objectFit: "contain",
    transitionDuration: "500ms",
    transitionProperty: "transform",
    transitionTimingFunction: "var(--ease-out-quart)",
    width: "100%",
    ":hover": { transform: "scale(1.01)" },
  },
  loading: { color: tokens.textMuted, fontSize: "0.875rem", lineHeight: "1.25rem" },
  documentSurface: { backgroundColor: tokens.surfaceSoft, padding: "1.5rem" },
  documentContent: { maxWidth: "24rem", textAlign: "center" },
  documentIconFrame: {
    alignItems: "center",
    color: tokens.textSoft,
    display: "flex",
    height: "3.5rem",
    justifyContent: "center",
    marginInline: "auto",
    width: "3.5rem",
  },
  documentIcon: { height: "1.75rem", width: "1.75rem" },
  documentTitle: {
    color: tokens.text,
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    marginTop: "1rem",
  },
  documentDescription: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.5rem",
  },
});

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
    <section data-surface="transcript-detail-preview" {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.source)}>
          <span className={`memora-gentle-float ${stylex.props(styles.iconFrame).className ?? ""}`}>
            <Icon {...stylex.props(styles.sourceIcon)} weight="duotone" />
          </span>
          <div {...stylex.props(styles.sourceDetails)}>
            <p {...stylex.props(styles.label)}>Source</p>
            <p {...stylex.props(styles.metadata)}>
              {recording.type} · {formatBytes(recording.sizeBytes)}
            </p>
          </div>
        </div>
      </div>

      <div>
        {recording.type === "video" ? (
          <div
            className={`memora-surface-glow ${stylex.props(styles.surface, styles.videoSurface).className ?? ""}`}
          >
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
          <div
            className={`memora-surface-glow ${stylex.props(styles.surface, styles.audioSurface).className ?? ""}`}
          >
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
          <div
            className={`memora-surface-glow ${stylex.props(styles.surface, styles.centeredSurface, styles.imageSurface).className ?? ""}`}
          >
            {recording.audioUrl ? (
              <img
                src={recording.audioUrl}
                alt={recording.name}
                {...stylex.props(styles.image)}
                loading="lazy"
              />
            ) : (
              <div {...stylex.props(styles.loading)}>Loading image...</div>
            )}
          </div>
        ) : null}

        {recording.type === "document" ? (
          <div
            className={`memora-surface-glow ${stylex.props(styles.surface, styles.centeredSurface, styles.documentSurface).className ?? ""}`}
          >
            <div {...stylex.props(styles.documentContent)}>
              <span
                className={`memora-gentle-float ${stylex.props(styles.documentIconFrame).className ?? ""}`}
              >
                <FileTextIcon {...stylex.props(styles.documentIcon)} weight="duotone" />
              </span>
              <p {...stylex.props(styles.documentTitle)}>Document preview is kept minimal here.</p>
              <p {...stylex.props(styles.documentDescription)}>
                Focus this page on transcript work. File detail stays lightweight.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
