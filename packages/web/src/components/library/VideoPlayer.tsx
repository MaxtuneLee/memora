import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
        className="group relative overflow-hidden rounded-xl bg-black"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <video
          ref={setVideoNode}
          className="aspect-video w-full cursor-pointer"
          playsInline
          onClick={handleVideoClick}
        />

        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
            showControls || !isPlaying ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
                scheduleHide();
              }}
              className="flex size-16 items-center justify-center rounded-full bg-gray-600/10 text-white backdrop-blur-sm transition-transform active:scale-90 hover:bg-black/40"
            >
              {isPlaying ? (
                <PauseIcon className="size-7" weight="fill" />
              ) : (
                <PlayIcon className="size-7 ml-0.5" weight="fill" />
              )}
            </button>
          </div>

          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8 pointer-events-auto">
            <div
              ref={progressRef}
              className="group/progress relative h-1 cursor-pointer rounded-full bg-white/20 transition-all hover:h-1.5"
              onMouseDown={handleProgressMouseDown}
            >
              <div
                ref={progressFillRef}
                className="absolute inset-y-0 left-0 rounded-full bg-white transition-none"
                style={{ width: "0%" }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span ref={elapsedRef} className="text-xs tabular-nums text-white/70">
                {formatDuration(0)}
              </span>
              <span ref={remainingRef} className="text-xs tabular-nums text-white/70">
                -{formatDuration(effectiveDuration)}
              </span>
            </div>
          </div>

          <div className="absolute top-3 right-3 pointer-events-auto">
            <div className="flex items-center gap-2">
              {isFullscreen && captionCues.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCaptionsEnabled((prev) => !prev);
                    scheduleHide();
                  }}
                  className={`flex size-8 items-center justify-center rounded-lg backdrop-blur-sm transition-colors ${
                    captionsEnabled
                      ? "bg-white/20 text-white hover:bg-white/30"
                      : "bg-gray-700/50 text-white/70 hover:bg-gray-600/60 hover:text-white"
                  }`}
                  aria-label={captionsEnabled ? "Hide captions" : "Show captions"}
                >
                  <SubtitlesIcon className="size-4" weight={captionsEnabled ? "fill" : "bold"} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="flex size-8 items-center justify-center rounded-lg bg-gray-600/10 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
              >
                {isFullscreen ? (
                  <CornersInIcon className="size-4" weight="bold" />
                ) : (
                  <CornersOutIcon className="size-4" weight="bold" />
                )}
              </button>
            </div>
          </div>
        </div>

        {isFullscreen && captionsEnabled && activeCueIndex >= 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-5 sm:bottom-20">
            <div className="max-w-[min(90vw,980px)] rounded-xl bg-black/45 px-4 py-2 text-center text-[clamp(1rem,1.8vw,1.6rem)] font-medium text-zinc-50 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm">
              <p className="line-clamp-2 leading-tight">{captionCues[activeCueIndex]?.text}</p>
            </div>
          </div>
        )}
      </div>
    );
  },
);
