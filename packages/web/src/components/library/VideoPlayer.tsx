import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useAudioPlayer } from "@/hooks/library/useAudioPlayer";
import { formatDuration } from "@/lib/format";
import type { RecordingWord } from "@/types/library";
import { buildCaptionCues } from "@/lib/transcript/transcriptSearchExport";
import {
  PauseIcon,
  PlayIcon,
  CornersOutIcon,
  CornersInIcon,
  SubtitlesIcon,
} from "@phosphor-icons/react";

// ponytail: this overlay sits on top of arbitrary video pixels, not the app background, so it
// keeps the universal white-on-black-scrim video-player convention (YouTube, native <video>
// controls, etc.) in both themes rather than following app tokens -- app-theme colors here would
// break contrast against a bright video frame in light mode. Revisit only if a per-video theme
// (e.g. reading average frame luminance) is ever wanted.
const styles = stylex.create({
  root: { backgroundColor: "#000", borderRadius: 12, overflow: "hidden", position: "relative" },
  video: { aspectRatio: "16 / 9", cursor: "pointer", width: "100%" },
  overlay: { inset: 0, pointerEvents: "none", position: "absolute", transition: "opacity 300ms" },
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
  gradient: {
    backgroundImage: "linear-gradient(to top, rgb(0 0 0 / 0.6), transparent)",
    inset: 0,
    position: "absolute",
  },
  center: {
    alignItems: "center",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    pointerEvents: "auto",
    position: "absolute",
  },
  centerButton: {
    alignItems: "center",
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(75 85 99 / 0.1)",
    borderRadius: 9999,
    color: "#fff",
    display: "flex",
    height: 64,
    justifyContent: "center",
    transition: "transform 150ms, background-color 150ms",
    width: 64,
    ":active": { transform: "scale(0.9)" },
    ":hover": { backgroundColor: "rgb(0 0 0 / 0.4)" },
  },
  largeIcon: { height: 28, width: 28 },
  playIcon: { height: 28, marginLeft: 2, width: 28 },
  controls: {
    bottom: 0,
    left: 0,
    paddingBlockEnd: 12,
    paddingBlockStart: 32,
    paddingInline: 16,
    pointerEvents: "auto",
    position: "absolute",
    right: 0,
  },
  progress: {
    backgroundColor: "rgb(255 255 255 / 0.2)",
    borderRadius: 9999,
    cursor: "pointer",
    height: 4,
    position: "relative",
    transition: "height 150ms",
    ":hover": { height: 6 },
  },
  progressFill: {
    backgroundColor: "#fff",
    borderRadius: 9999,
    insetBlock: 0,
    left: 0,
    position: "absolute",
  },
  times: { alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: 8 },
  time: { color: "rgb(255 255 255 / 0.7)", fontSize: 12, fontVariantNumeric: "tabular-nums" },
  actions: { pointerEvents: "auto", position: "absolute", right: 12, top: 12 },
  actionRow: { alignItems: "center", display: "flex", gap: 8 },
  actionButton: {
    alignItems: "center",
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(75 85 99 / 0.1)",
    borderRadius: 8,
    color: "rgb(255 255 255 / 0.8)",
    display: "flex",
    height: 32,
    justifyContent: "center",
    transition: "background-color 150ms, color 150ms",
    width: 32,
    ":hover": { backgroundColor: "rgb(0 0 0 / 0.6)", color: "#fff" },
  },
  captionsActive: {
    backgroundColor: "rgb(255 255 255 / 0.2)",
    color: "#fff",
    ":hover": { backgroundColor: "rgb(255 255 255 / 0.3)" },
  },
  captionsIdle: {
    backgroundColor: "rgb(55 65 81 / 0.5)",
    color: "rgb(255 255 255 / 0.7)",
    ":hover": { backgroundColor: "rgb(75 85 99 / 0.6)", color: "#fff" },
  },
  icon: { height: 16, width: 16 },
  captionArea: {
    bottom: 64,
    display: "flex",
    justifyContent: "center",
    left: 0,
    paddingInline: 20,
    pointerEvents: "none",
    position: "absolute",
    right: 0,
    zIndex: 20,
    "@media (min-width: 640px)": { bottom: 80 },
  },
  caption: {
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(0 0 0 / 0.45)",
    borderRadius: 12,
    boxShadow: "0 10px 40px rgb(0 0 0 / 0.45)",
    color: "#fafafa",
    fontSize: "clamp(1rem, 1.8vw, 1.6rem)",
    fontWeight: 500,
    maxWidth: "min(90vw, 980px)",
    paddingBlock: 8,
    paddingInline: 16,
    textAlign: "center",
  },
  captionText: {
    display: "-webkit-box",
    lineClamp: 2,
    lineHeight: 1.25,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
  },
});

interface VideoPlayerProps {
  videoUrl: string | undefined;
  readyToken: number;
  duration: number;
  onReady: () => void;
  transcriptWords?: RecordingWord[];
  timeRef?: React.RefObject<number>;
  onPlayStateChange?: (playing: boolean) => void;
  onDurationChange?: (duration: number) => void;
  seekRef?: React.RefObject<number | null>;
}

export const VideoPlayer = memo(
  ({
    videoUrl,
    readyToken,
    duration,
    onReady,
    transcriptWords = [],
    timeRef,
    onPlayStateChange,
    onDurationChange,
    seekRef,
  }: VideoPlayerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hasSignaledReadyRef = useRef(false);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [captionsEnabled, setCaptionsEnabled] = useState(true);
    const [activeCueIndex, setActiveCueIndex] = useState(-1);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const progressRef = useRef<HTMLDivElement>(null);
    const progressFillRef = useRef<HTMLDivElement>(null);
    const elapsedRef = useRef<HTMLSpanElement>(null);
    const remainingRef = useRef<HTMLSpanElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const setVideoNode = useCallback(
      (node: HTMLVideoElement | null) => {
        videoRef.current = node;
        if (!node || hasSignaledReadyRef.current) return;
        hasSignaledReadyRef.current = true;
        onReady();
      },
      [onReady],
    );

    useEffect(() => {
      const video = videoRef.current;
      if (videoUrl && video) {
        video.src = videoUrl;
        video.load();
        if (video.readyState >= 1) {
          video.dispatchEvent(new Event("durationchange"));
        }
      }
    }, [readyToken, videoUrl]);

    const mediaRef = videoRef as unknown as React.RefObject<HTMLAudioElement>;

    const {
      isPlaying,
      displayTimeRef: playerTimeRef,
      duration: playerDuration,
      togglePlay,
      seek,
    } = useAudioPlayer(mediaRef, readyToken, duration ?? undefined);
    const captionCues = useMemo(() => buildCaptionCues(transcriptWords), [transcriptWords]);

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
        const mediaDuration = videoRef.current?.duration;
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

    const scheduleHide = useCallback(() => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setShowControls(true);
      hideTimerRef.current = setTimeout(() => {
        if (!isDragging) setShowControls(false);
      }, 3000);
    }, [isDragging]);

    const handleMouseMove = useCallback(() => {
      scheduleHide();
    }, [scheduleHide]);

    const handleMouseLeave = useCallback(() => {
      if (!isDragging) {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        setShowControls(false);
      }
    }, [isDragging]);

    useEffect(() => {
      return () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      };
    }, []);

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

    const toggleFullscreen = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;

      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        el.requestFullscreen();
      }
    }, []);

    useEffect(() => {
      const handleChange = () => {
        const fullscreenNode = document.fullscreenElement;
        const isCurrentVideoFullscreen =
          !!fullscreenNode && fullscreenNode === containerRef.current;
        setIsFullscreen(isCurrentVideoFullscreen);
        if (isCurrentVideoFullscreen) {
          setCaptionsEnabled(true);
        } else {
          setActiveCueIndex(-1);
        }
      };
      document.addEventListener("fullscreenchange", handleChange);
      return () => document.removeEventListener("fullscreenchange", handleChange);
    }, []);

    useEffect(() => {
      if (!isFullscreen || !captionsEnabled || captionCues.length === 0) return;

      let rafId: number;
      let previousIndex = -2;

      const tick = () => {
        const t = playerTimeRef.current;
        let nextIndex = -1;

        for (let i = captionCues.length - 1; i >= 0; i--) {
          const cue = captionCues[i];
          if (t >= cue.startSec && t <= cue.endSec) {
            nextIndex = i;
            break;
          }
          if (t > cue.endSec) {
            break;
          }
        }

        if (nextIndex !== previousIndex) {
          previousIndex = nextIndex;
          setActiveCueIndex(nextIndex);
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [captionCues, captionsEnabled, isFullscreen, playerTimeRef]);

    const handleVideoClick = useCallback(() => {
      togglePlay();
      scheduleHide();
    }, [togglePlay, scheduleHide]);

    return (
      <div
        ref={containerRef}
        {...stylex.props(styles.root)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <video
          ref={setVideoNode}
          {...stylex.props(styles.video)}
          playsInline
          onClick={handleVideoClick}
        />

        <div
          {...stylex.props(
            styles.overlay,
            showControls || !isPlaying ? styles.visible : styles.hidden,
          )}
        >
          <div {...stylex.props(styles.gradient)} />

          <div {...stylex.props(styles.center)}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
                scheduleHide();
              }}
              {...stylex.props(styles.centerButton)}
            >
              {isPlaying ? (
                <PauseIcon className={stylex.props(styles.largeIcon).className} weight="fill" />
              ) : (
                <PlayIcon className={stylex.props(styles.playIcon).className} weight="fill" />
              )}
            </button>
          </div>

          <div {...stylex.props(styles.controls)}>
            <div
              ref={progressRef}
              {...stylex.props(styles.progress)}
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

          <div {...stylex.props(styles.actions)}>
            <div {...stylex.props(styles.actionRow)}>
              {isFullscreen && captionCues.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCaptionsEnabled((prev) => !prev);
                    scheduleHide();
                  }}
                  {...stylex.props(
                    styles.actionButton,
                    captionsEnabled ? styles.captionsActive : styles.captionsIdle,
                  )}
                  aria-label={captionsEnabled ? "Hide captions" : "Show captions"}
                >
                  <SubtitlesIcon
                    className={stylex.props(styles.icon).className}
                    weight={captionsEnabled ? "fill" : "bold"}
                  />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                {...stylex.props(styles.actionButton)}
              >
                {isFullscreen ? (
                  <CornersInIcon className={stylex.props(styles.icon).className} weight="bold" />
                ) : (
                  <CornersOutIcon className={stylex.props(styles.icon).className} weight="bold" />
                )}
              </button>
            </div>
          </div>
        </div>

        {isFullscreen && captionsEnabled && activeCueIndex >= 0 && (
          <div {...stylex.props(styles.captionArea)}>
            <div {...stylex.props(styles.caption)}>
              <p {...stylex.props(styles.captionText)}>{captionCues[activeCueIndex]?.text}</p>
            </div>
          </div>
        )}
      </div>
    );
  },
);
