import { memo, useCallback, useEffect, useRef, useState } from "react";
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
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="relative px-5 pt-6 pb-2">
          {waveformData ? (
            <div className="h-24">
              <WaveformCanvas
                peaks={waveformData.peaks}
                progress={0}
                getProgress={getWaveformProgress}
                height={96}
                className="w-full"
                onClick={handleSeek}
                onDrag={handleSeek}
              />
            </div>
          ) : (
            <div className="flex h-24 items-end justify-center gap-[2px] px-2">
              {PLACEHOLDER_HEIGHTS.map((h, i) => (
                <div key={i} className="w-1 rounded-full bg-zinc-200" style={{ height: `${h}%` }} />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-1">
          <div
            ref={progressRef}
            className={`relative h-1 cursor-pointer rounded-full bg-zinc-200 transition-all hover:h-1.5 ${isDragging ? "h-1.5" : ""}`}
            onMouseDown={handleProgressMouseDown}
          >
            <div
              ref={progressFillRef}
              className="absolute inset-y-0 left-0 rounded-full bg-zinc-800 transition-none"
              style={{ width: "0%" }}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between">
            <span ref={elapsedRef} className="text-[11px] tabular-nums text-zinc-400">
              {formatDuration(0)}
            </span>
            <span ref={remainingRef} className="text-[11px] tabular-nums text-zinc-400">
              -{formatDuration(effectiveDuration)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-8 pb-5 pt-2">
          <button
            onClick={onSkipBack}
            className="relative flex size-11 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-700"
            aria-label="Skip back 15 seconds"
          >
            <ArrowCounterClockwiseIcon className="size-5" />
            <span className="absolute text-[8px] font-semibold">15</span>
          </button>

          <button
            onClick={togglePlay}
            className="flex size-14 items-center justify-center rounded-full bg-zinc-900 text-white transition-transform active:scale-95"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <PauseIcon className="size-6" weight="fill" />
            ) : (
              <PlayIcon className="size-6 ml-0.5" weight="fill" />
            )}
          </button>

          <button
            onClick={onSkipForward}
            className="relative flex size-11 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-700"
            aria-label="Skip forward 15 seconds"
          >
            <ArrowClockwiseIcon className="size-5" />
            <span className="absolute text-[8px] font-semibold">15</span>
          </button>
        </div>

        <audio ref={setAudioNode} className="hidden" />
      </div>
    );
  },
);
