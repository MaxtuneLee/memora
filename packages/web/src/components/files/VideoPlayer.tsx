import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { formatDuration } from "@/lib/format";
import {
  PauseIcon,
  PlayIcon,
  CornersOutIcon,
  CornersInIcon,
} from "@phosphor-icons/react";

interface VideoPlayerProps {
  videoUrl: string | undefined;
  readyToken: number;
  duration: number;
  onReady: () => void;
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

        if (timeRef) {
          timeRef.current = t;
        }

        if (seekRef && seekRef.current != null) {
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
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener("fullscreenchange", handleChange);
      return () => document.removeEventListener("fullscreenchange", handleChange);
    }, []);

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
    );
  },
);
