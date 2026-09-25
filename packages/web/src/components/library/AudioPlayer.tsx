import { memo, useCallback, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useAudioPlayer } from "@/hooks/library/useAudioPlayer";
import { useWaveformData } from "@/hooks/library/useWaveformData";
import { formatDuration } from "@/lib/format";
import {
  PauseIcon,
  PlayIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { WaveformCanvas } from "./WaveformCanvas";
import { tokens } from "../../styles/stylex.stylex";

const PLACEHOLDER_HEIGHTS = Array.from({ length: 60 }, (_, i) => 12 + ((i * 37 + 13) % 60));

interface AudioPlayerProps {
  audioUrl: string | undefined;
  audioReadyToken: number;
  duration: number;
  handleAudioReady: () => void;
  timeRef?: React.RefObject<number>;
  onPlayStateChange?: (playing: boolean) => void;
  onDurationChange?: (duration: number) => void;
  seekRef?: React.RefObject<number | null>;
}

const WAVEFORM_BAR_COUNT = 400;
const styles = stylex.create({
  root: { overflow: "hidden" },
  waveformWrap: {
    paddingBlockEnd: 8,
    paddingBlockStart: 24,
    paddingInline: 20,
    position: "relative",
  },
  waveform: { height: 96 },
  waveformCanvas: { width: "100%" },
  placeholder: {
    alignItems: "flex-end",
    display: "flex",
    gap: 2,
    height: 96,
    justifyContent: "center",
    paddingInline: 8,
  },
  placeholderBar: {
    backgroundColor: tokens.border,
    borderRadius: 9999,
    transition: "transform 300ms var(--ease-out-quart)",
    width: 4,
  },
  progressWrap: { paddingBlockEnd: 4, paddingInline: 20 },
  progress: {
    backgroundColor: tokens.border,
    borderRadius: 9999,
    cursor: "pointer",
    height: 4,
    position: "relative",
    transition: "height 150ms",
    ":hover": { height: 6 },
  },
  dragging: { height: 6 },
  progressFill: {
    backgroundColor: tokens.textStrong,
    borderRadius: 9999,
    insetBlock: 0,
    left: 0,
    position: "absolute",
  },
  times: { alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: 6 },
  time: {
    color: tokens.textSoft,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
  },
  controls: {
    alignItems: "center",
    display: "flex",
    gap: 32,
    justifyContent: "center",
    paddingBlockEnd: 20,
    paddingBlockStart: 8,
  },
  skip: {
    alignItems: "center",
    borderRadius: 9999,
    color: tokens.textSoft,
    display: "flex",
    height: 44,
    justifyContent: "center",
    position: "relative",
    transition: "color 150ms",
    width: 44,
    ":hover": { color: tokens.text },
  },
  play: {
    alignItems: "center",
    backgroundColor: tokens.textStrong,
    borderRadius: 9999,
    boxShadow: "0 18px 40px -30px rgb(0 0 0 / 0.9)",
    color: tokens.surface,
    display: "flex",
    height: 56,
    justifyContent: "center",
    transition: "transform 150ms, box-shadow 150ms, background-color 150ms",
    width: 56,
    ":hover": { boxShadow: "0 22px 42px -26px rgb(0 0 0 / 0.95)" },
  },
  smallIcon: { height: 20, width: 20 },
  largeIcon: { height: 24, width: 24 },
  playIcon: { height: 24, marginLeft: 2, width: 24 },
  count: { fontSize: 8, fontWeight: 600, position: "absolute" },
  hidden: { display: "none" },
});

export const AudioPlayer = memo(
  ({
    audioUrl,
    audioReadyToken,
    duration,
    handleAudioReady,
    timeRef,
    onPlayStateChange,
    onDurationChange,
    seekRef,
  }: AudioPlayerProps) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const hasSignaledReadyRef = useRef(false);
    const progressRef = useRef<HTMLDivElement>(null);
    const progressFillRef = useRef<HTMLDivElement>(null);
    const elapsedRef = useRef<HTMLSpanElement>(null);
    const remainingRef = useRef<HTMLSpanElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const setAudioNode = useCallback(
      (node: HTMLAudioElement | null) => {
        audioRef.current = node;
        if (!node || hasSignaledReadyRef.current) return;
        hasSignaledReadyRef.current = true;
        handleAudioReady();
      },
      [handleAudioReady],
    );

    useEffect(() => {
      const audio = audioRef.current;
      if (audioUrl && audio) {
        audio.src = audioUrl;
        audio.load();
        if (audio.readyState >= 1) {
          audio.dispatchEvent(new Event("durationchange"));
        }
      }
    }, [audioReadyToken, audioUrl]);

    const {
      isPlaying,
      displayTimeRef: playerTimeRef,
      duration: playerDuration,
      togglePlay,
      seek,
    } = useAudioPlayer(
      audioRef as React.RefObject<HTMLAudioElement>,
      audioReadyToken,
      duration ?? undefined,
    );

    const { data: waveformData } = useWaveformData(audioUrl, WAVEFORM_BAR_COUNT);

    const effectiveDuration = playerDuration || duration || 0;
    const effectiveDurationRef = useRef(effectiveDuration);

    useEffect(() => {
      effectiveDurationRef.current = effectiveDuration;
    }, [effectiveDuration]);

    useEffect(() => {
      let rafId: number;
      let lastElapsed = "";
      let lastRemaining = "";

      const tick = () => {
        const t = playerTimeRef.current;
        const dur = effectiveDurationRef.current;
        const mediaDuration = audioRef.current?.duration;
        const hasSeekableDuration =
          (Number.isFinite(dur) && dur > 0) ||
          (typeof mediaDuration === "number" &&
            Number.isFinite(mediaDuration) &&
            mediaDuration > 0);

        if (timeRef) {
          timeRef.current = t;
        }

        if (seekRef && seekRef.current != null && hasSeekableDuration) {
          seek(seekRef.current);
          seekRef.current = null;
        }

        const progress = dur > 0 ? t / dur : 0;
        if (progressFillRef.current) {
          progressFillRef.current.style.width = `${progress * 100}%`;
        }

        const elapsed = formatDuration(t);
        if (elapsed !== lastElapsed && elapsedRef.current) {
          elapsedRef.current.textContent = elapsed;
          lastElapsed = elapsed;
        }

        const rem = formatDuration(Math.max(0, dur - t));
        if (rem !== lastRemaining && remainingRef.current) {
          remainingRef.current.textContent = `-${rem}`;
          lastRemaining = rem;
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [playerTimeRef, timeRef, seekRef, seek]);

    useEffect(() => {
      onPlayStateChange?.(isPlaying);
    }, [isPlaying, onPlayStateChange]);

    useEffect(() => {
      if (playerDuration > 0) onDurationChange?.(playerDuration);
    }, [playerDuration, onDurationChange]);

    const getWaveformProgress = useCallback(() => {
      const dur = effectiveDurationRef.current;
      if (!(Number.isFinite(dur) && dur > 0)) {
        return 0;
      }
      return playerTimeRef.current / dur;
    }, [playerTimeRef]);

    const handleSeek = useCallback(
      (progressPercent: number) => {
        const dur = effectiveDurationRef.current;
        if (dur) {
          seek(progressPercent * dur);
        }
      },
      [seek],
    );

    const handleProgressSeek = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressRef.current) return;
        const dur = effectiveDurationRef.current;
        if (!dur) return;
        const rect = progressRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seek(pct * dur);
      },
      [seek],
    );

    const handleProgressDrag = useCallback(
      (e: MouseEvent) => {
        if (!progressRef.current) return;
        const dur = effectiveDurationRef.current;
        if (!dur) return;
        const rect = progressRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seek(pct * dur);
      },
      [seek],
    );

    const handleProgressMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        setIsDragging(true);
        handleProgressSeek(e);

        const handleMove = (ev: MouseEvent) => handleProgressDrag(ev);
        const handleUp = () => {
          setIsDragging(false);
          document.removeEventListener("mousemove", handleMove);
          document.removeEventListener("mouseup", handleUp);
        };

        document.addEventListener("mousemove", handleMove);
        document.addEventListener("mouseup", handleUp);
      },
      [handleProgressSeek, handleProgressDrag],
    );

    const onSkipBack = useCallback(() => {
      const current = audioRef.current?.currentTime ?? playerTimeRef.current;
      seek(Math.max(0, current - 15));
    }, [playerTimeRef, seek]);

    const onSkipForward = useCallback(() => {
      const current = audioRef.current?.currentTime ?? playerTimeRef.current;
      const dur = effectiveDurationRef.current;
      seek(Math.min(dur, current + 15));
    }, [playerTimeRef, seek]);

    return (
      <div {...stylex.props(styles.root)}>
        <div {...stylex.props(styles.waveformWrap)}>
          {waveformData ? (
            <div {...stylex.props(styles.waveform)}>
              <WaveformCanvas
                peaks={waveformData.peaks}
                progress={0}
                getProgress={getWaveformProgress}
                height={96}
                className={stylex.props(styles.waveformCanvas).className}
                onClick={handleSeek}
                onDrag={handleSeek}
              />
            </div>
          ) : (
            <div {...stylex.props(styles.placeholder)}>
              {PLACEHOLDER_HEIGHTS.map((h, i) => (
                <div key={i} {...stylex.props(styles.placeholderBar)} style={{ height: `${h}%` }} />
              ))}
            </div>
          )}
        </div>

        <div {...stylex.props(styles.progressWrap)}>
          <div
            ref={progressRef}
            className={`memora-surface-glow ${stylex.props(styles.progress, isDragging && styles.dragging).className}`}
            onMouseDown={handleProgressMouseDown}
          >
            <div
              ref={progressFillRef}
              {...stylex.props(styles.progressFill)}
              style={{ width: "0%" }}
            />
          </div>

          <div {...stylex.props(styles.times)}>
            <span ref={elapsedRef} {...stylex.props(styles.time)}>
              {formatDuration(0)}
            </span>
            <span ref={remainingRef} {...stylex.props(styles.time)}>
              -{formatDuration(effectiveDuration)}
            </span>
          </div>
        </div>

        <div {...stylex.props(styles.controls)}>
          <button
            onClick={onSkipBack}
            className={`memora-interactive ${stylex.props(styles.skip).className}`}
            aria-label="Skip back 15 seconds"
          >
            <ArrowCounterClockwiseIcon className={stylex.props(styles.smallIcon).className} />
            <span {...stylex.props(styles.count)}>15</span>
          </button>

          <button
            onClick={togglePlay}
            className={`memora-interactive ${stylex.props(styles.play).className}`}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <PauseIcon className={stylex.props(styles.largeIcon).className} weight="fill" />
            ) : (
              <PlayIcon className={stylex.props(styles.playIcon).className} weight="fill" />
            )}
          </button>

          <button
            onClick={onSkipForward}
            className={`memora-interactive ${stylex.props(styles.skip).className}`}
            aria-label="Skip forward 15 seconds"
          >
            <ArrowClockwiseIcon className={stylex.props(styles.smallIcon).className} />
            <span {...stylex.props(styles.count)}>15</span>
          </button>
        </div>

        <audio ref={setAudioNode} {...stylex.props(styles.hidden)} />
      </div>
    );
  },
);
