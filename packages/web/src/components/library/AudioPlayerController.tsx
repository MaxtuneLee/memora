import { useAudioPlayer } from "@/hooks/library/useAudioPlayer";
import { useWaveformData } from "@/hooks/library/useWaveformData";
import type { RecordingWord } from "@/types/library";
import { formatDuration } from "@/lib/format";
import { Button } from "@base-ui/react/button";
import {
  ArrowCounterClockwiseIcon,
  PauseIcon,
  PlayIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { TranscriptWords } from "./TranscriptWords";
import { WaveformCanvas } from "./WaveformCanvas";

const WAVEFORM_BAR_COUNT = 400; // More samples for smoother canvas rendering
const ZOOM_VISIBLE_SECONDS = 7;
const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });
const styles = stylex.create({
  surface: {
    backgroundColor: "#fff",
    border: "1px solid #e4e4e7",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  relative: { position: "relative" },
  transcript: {
    overflow: "hidden",
    transition: "height 500ms ease-out, min-height 500ms ease-out, opacity 500ms ease-out",
  },
  transcriptOpen: { minHeight: 256, opacity: 1 },
  transcriptClosed: { height: 0, opacity: 0 },
  transcriptBody: { padding: 16 },
  loading: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    justifyContent: "center",
    paddingBlock: 48,
  },
  spinner: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: spin,
    border: "2px solid #e4e4e7",
    borderRadius: 9999,
    borderTopColor: "#52525b",
    height: 32,
    width: 32,
  },
  textCenter: { textAlign: "center" },
  loadingTitle: { color: "#3f3f46", fontSize: 14, fontWeight: 500, margin: 0 },
  loadingDetail: { color: "#71717a", fontSize: 12, marginTop: 4 },
  progress: {
    backgroundColor: "#e4e4e7",
    borderRadius: 9999,
    height: 6,
    marginInline: "auto",
    marginTop: 12,
    overflow: "hidden",
    width: 192,
  },
  progressFill: {
    backgroundColor: "#52525b",
    borderRadius: 9999,
    height: "100%",
    transition: "width 300ms",
  },
  transcriptText: {
    color: "#3f3f46",
    fontSize: 14,
    lineHeight: 1.625,
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  emptyTranscript: { color: "#71717a", fontSize: 14, paddingBlock: 32, textAlign: "center" },
  timeline: { borderTop: "1px solid #f4f4f5", paddingBlock: 12, paddingInline: 16 },
  waveform: { width: "100%" },
  waveformFallback: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    height: 40,
    justifyContent: "center",
  },
  smallSpinner: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: spin,
    border: "1px solid #d4d4d8",
    borderRadius: 9999,
    borderTopColor: "#71717a",
    height: 14,
    width: 14,
  },
  waveformLoading: { color: "#a1a1aa", fontSize: 12 },
  line: { backgroundColor: "#e4e4e7", height: 1, width: "100%" },
  zoomWindow: {
    backgroundColor: "rgb(59 130 246 / 0.1)",
    borderInline: "1px solid rgb(59 130 246 / 0.3)",
    insetBlock: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  playhead: {
    backgroundColor: "#3b82f6",
    insetBlock: 0,
    pointerEvents: "none",
    position: "absolute",
    width: 2,
  },
  labels: {
    color: "#a1a1aa",
    display: "flex",
    fontSize: 12,
    justifyContent: "space-between",
    marginTop: 4,
  },
  tabular: { fontVariantNumeric: "tabular-nums" },
  time: { color: "#18181b", fontSize: 36, fontWeight: 300, fontVariantNumeric: "tabular-nums" },
  timeWrap: { textAlign: "center" },
  controls: { alignItems: "center", display: "flex", gap: 24, justifyContent: "center" },
  skipButton: {
    alignItems: "center",
    borderRadius: 9999,
    color: "#71717a",
    display: "flex",
    height: 56,
    justifyContent: "center",
    position: "relative",
    transition: "color 150ms, background-color 150ms",
    width: 56,
    ":hover": { backgroundColor: "#f4f4f5", color: "#3f3f46" },
  },
  playButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    border: "1px solid #e4e4e7",
    borderRadius: 9999,
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    color: "#27272a",
    display: "flex",
    height: 64,
    justifyContent: "center",
    transition: "box-shadow 150ms, transform 150ms",
    width: 64,
    ":hover": { boxShadow: "0 4px 6px rgb(0 0 0 / 0.1)" },
    ":active": { transform: "scale(0.95)" },
  },
  largeIcon: { height: 28, width: 28 },
  playIcon: { height: 28, marginLeft: 2, width: 28 },
  count: { fontSize: 10, fontWeight: 500, position: "absolute" },
});

export interface AudioPlayerProps {
  audioUrl: string | undefined;
  audioRef: React.RefObject<HTMLAudioElement>;
  audioReadyToken: number;
  currentTime?: number;
  duration: number;
  showTranscript?: boolean;
  transcript?: { text: string; words: RecordingWord[] } | null;
  isTranscribing?: boolean;
  transcriptionStatus?: string;
  transcriptionProgress?: number;
}

export const AudioPlayerController = ({
  audioUrl,
  audioRef,
  audioReadyToken,
  duration,
  showTranscript = false,
  transcript,
  isTranscribing = false,
  transcriptionStatus,
  transcriptionProgress = 0,
}: AudioPlayerProps) => {
  const {
    isPlaying,
    displayTimeRef,
    duration: playerDuration,
    togglePlay,
    seek,
  } = useAudioPlayer(audioRef, audioReadyToken, duration ?? undefined);

  const { data: waveformData, isLoading: isWaveformLoading } = useWaveformData(
    audioUrl,
    WAVEFORM_BAR_COUNT,
  );

  const [uiTime, setUiTime] = useState(0);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const zoomIndicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    let prevFormatted = "";

    const tick = () => {
      const t = displayTimeRef.current;
      const dur = playerDuration || 0;
      const progress = dur > 0 ? t / dur : 0;

      if (playheadRef.current) {
        playheadRef.current.style.left = `${progress * 100}%`;
      }

      if (zoomIndicatorRef.current && dur > 0) {
        const zoomStart = Math.max(0, t - ZOOM_VISIBLE_SECONDS / 2);
        const zoomEnd = Math.min(dur, t + ZOOM_VISIBLE_SECONDS / 2);
        zoomIndicatorRef.current.style.left = `${(zoomStart / dur) * 100}%`;
        zoomIndicatorRef.current.style.width = `${((zoomEnd - zoomStart) / dur) * 100}%`;
      }

      const formatted = formatDurationWithMs(t);
      if (formatted !== prevFormatted && timeDisplayRef.current) {
        timeDisplayRef.current.textContent = formatted;
        prevFormatted = formatted;
      }

      setUiTime(t);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [displayTimeRef, playerDuration]);

  const progress = playerDuration > 0 ? uiTime / playerDuration : 0;

  const handleSeek = useCallback(
    (progressPercent: number) => {
      if (playerDuration) {
        seek(progressPercent * playerDuration);
      }
    },
    [playerDuration, seek],
  );

  const onSkipBack = () => {
    const current = audioRef?.current?.currentTime ?? displayTimeRef.current;
    seek(Math.max(0, current - 15));
  };

  const onSkipForward = () => {
    const current = audioRef?.current?.currentTime ?? displayTimeRef.current;
    seek(Math.min(playerDuration, current + 15));
  };

  return (
    <>
      <div {...stylex.props(styles.surface)}>
        {/* Animated container for waveform/transcript transition */}
        <div {...stylex.props(styles.relative)}>
          {/* Transcript view */}
          <div
            {...stylex.props(
              styles.transcript,
              showTranscript ? styles.transcriptOpen : styles.transcriptClosed,
            )}
          >
            <div {...stylex.props(styles.transcriptBody)}>
              {isTranscribing ? (
                <div {...stylex.props(styles.loading)}>
                  <div {...stylex.props(styles.spinner)} />
                  <div {...stylex.props(styles.textCenter)}>
                    <p {...stylex.props(styles.loadingTitle)}>Transcribing audio...</p>
                    <p {...stylex.props(styles.loadingDetail)}>
                      {transcriptionStatus === "loading-model" && "Loading AI model..."}
                      {transcriptionStatus === "decoding" && "Decoding audio..."}
                      {transcriptionStatus === "transcribing" && "Processing speech..."}
                      {transcriptionStatus === "saving" && "Saving transcript..."}
                    </p>
                    <div {...stylex.props(styles.progress)}>
                      <div
                        {...stylex.props(styles.progressFill)}
                        style={{ width: `${transcriptionProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : transcript?.words && transcript.words.length > 0 ? (
                <TranscriptWords words={transcript.words} currentTime={uiTime} onSeek={seek} />
              ) : transcript?.text ? (
                <p {...stylex.props(styles.transcriptText)}>{transcript.text}</p>
              ) : (
                <p {...stylex.props(styles.emptyTranscript)}>No transcript available</p>
              )}
            </div>
          </div>
        </div>

        {/* Mini waveform / timeline (overview) */}
        <div {...stylex.props(styles.timeline)}>
          <div {...stylex.props(styles.relative)}>
            {waveformData ? (
              <WaveformCanvas
                peaks={waveformData.peaks}
                progress={progress}
                height={40}
                className={stylex.props(styles.waveform).className}
                onClick={handleSeek}
                onDrag={handleSeek}
              />
            ) : (
              <div {...stylex.props(styles.waveformFallback)}>
                {isWaveformLoading ? (
                  <>
                    <div {...stylex.props(styles.smallSpinner)} />
                    <span {...stylex.props(styles.waveformLoading)}>Loading waveform...</span>
                  </>
                ) : (
                  <div {...stylex.props(styles.line)} />
                )}
              </div>
            )}

            {/* Zoom window indicator overlay */}
            {duration > 0 && waveformData && (
              <div ref={zoomIndicatorRef} {...stylex.props(styles.zoomWindow)} />
            )}

            {/* Playhead indicator overlay */}
            {waveformData && (
              <div
                ref={playheadRef}
                {...stylex.props(styles.playhead)}
                style={{ left: `${progress * 100}%` }}
              />
            )}
          </div>

          {/* Timeline labels */}
          <div {...stylex.props(styles.labels)}>
            <span {...stylex.props(styles.tabular)}>0:00</span>
            <span {...stylex.props(styles.tabular)}>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      {/* Current time display */}
      <div {...stylex.props(styles.timeWrap)}>
        <span ref={timeDisplayRef} {...stylex.props(styles.time)}>
          {formatDurationWithMs(uiTime)}
        </span>
      </div>

      {/* Playback controls */}
      <div {...stylex.props(styles.controls)}>
        <Button
          onClick={onSkipBack}
          {...stylex.props(styles.skipButton)}
          aria-label="Skip back 15 seconds"
        >
          <ArrowCounterClockwiseIcon className={stylex.props(styles.largeIcon).className} />
          <span {...stylex.props(styles.count)}>15</span>
        </Button>

        <Button
          onClick={togglePlay}
          {...stylex.props(styles.playButton)}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <PauseIcon className={stylex.props(styles.largeIcon).className} weight="fill" />
          ) : (
            <PlayIcon className={stylex.props(styles.playIcon).className} weight="fill" />
          )}
        </Button>

        <Button
          onClick={onSkipForward}
          {...stylex.props(styles.skipButton)}
          aria-label="Skip forward 15 seconds"
        >
          <ArrowClockwiseIcon className={stylex.props(styles.largeIcon).className} />
          <span {...stylex.props(styles.count)}>15</span>
        </Button>
      </div>
    </>
  );
};

// Format duration with milliseconds (like 0:00:03.76)
const formatDurationWithMs = (seconds: number): string => {
  const total = Math.max(0, seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const ms = Math.floor((total % 1) * 100);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
};
