import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useWaveformData } from "@/hooks/useWaveformData";
import type { RecordingWord } from "@/lib/files";
import { formatDuration } from "@/lib/format";
import { Button } from "@base-ui/react/button";
import {
  ArrowCounterClockwiseIcon,
  PauseIcon,
  PlayIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TranscriptWords } from "./TranscriptWords";
import { WaveformCanvas } from "./WaveformCanvas";

const WAVEFORM_BAR_COUNT = 400; // More samples for smoother canvas rendering
const ZOOM_VISIBLE_SECONDS = 7;

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

  const { data: waveformData, isLoading: isWaveformLoading } = useWaveformData(audioUrl, WAVEFORM_BAR_COUNT);

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
      <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {/* Animated container for waveform/transcript transition */}
        <div className="relative">
          {/* Transcript view */}
          <div
            className={`transition-all duration-500 ease-out ${
              showTranscript
                ? "min-h-64 opacity-100"
                : "h-0 opacity-0 overflow-hidden"
            }`}
          >
            <div className="p-4">
              {isTranscribing ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12">
                  <div className="size-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-700">
                      Transcribing audio...
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {transcriptionStatus === "loading-model" &&
                        "Loading AI model..."}
                      {transcriptionStatus === "decoding" &&
                        "Decoding audio..."}
                      {transcriptionStatus === "transcribing" &&
                        "Processing speech..."}
                      {transcriptionStatus === "saving" &&
                        "Saving transcript..."}
                    </p>
                    <div className="mt-3 h-1.5 w-48 mx-auto overflow-hidden rounded-full bg-zinc-200">
                      <div
                        className="h-full rounded-full bg-zinc-600 transition-all duration-300"
                        style={{ width: `${transcriptionProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : transcript?.words && transcript.words.length > 0 ? (
                <TranscriptWords
                  words={transcript.words}
                  currentTime={uiTime}
                  onSeek={seek}
                />
              ) : transcript?.text ? (
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                  {transcript.text}
                </p>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-8">
                  No transcript available
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Mini waveform / timeline (overview) */}
        <div className="border-t border-zinc-100 px-4 py-3">
          <div className="relative">
            {waveformData ? (
              <WaveformCanvas
                peaks={waveformData.peaks}
                progress={progress}
                height={40}
                className="w-full"
                onClick={handleSeek}
                onDrag={handleSeek}
              />
            ) : (
              <div className="h-10 flex items-center justify-center gap-2">
                {isWaveformLoading ? (
                  <>
                    <div className="size-3.5 animate-spin rounded-full border border-zinc-300 border-t-zinc-500" />
                    <span className="text-xs text-zinc-400">Loading waveform...</span>
                  </>
                ) : (
                  <div className="h-px w-full bg-zinc-200" />
                )}
              </div>
            )}

            {/* Zoom window indicator overlay */}
            {duration > 0 && waveformData && (
              <div
                ref={zoomIndicatorRef}
                className="absolute top-0 bottom-0 bg-blue-500/10 border-x border-blue-500/30 pointer-events-none"
              />
            )}

            {/* Playhead indicator overlay */}
            {waveformData && (
              <div
                ref={playheadRef}
                className="absolute top-0 bottom-0 w-0.5 bg-blue-500 pointer-events-none"
                style={{ left: `${progress * 100}%` }}
              />
            )}
          </div>

          {/* Timeline labels */}
          <div className="flex justify-between mt-1 text-xs text-zinc-400">
            <span className="tabular-nums">0:00</span>
            <span className="tabular-nums">{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      {/* Current time display */}
      <div className="text-center">
        <span ref={timeDisplayRef} className="text-4xl font-light tabular-nums text-zinc-900">
          {formatDurationWithMs(uiTime)}
        </span>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-6">
        <Button
          onClick={onSkipBack}
          className="relative flex size-14 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-zinc-700 hover:bg-zinc-100"
          aria-label="Skip back 15 seconds"
        >
          <ArrowCounterClockwiseIcon className="size-7" />
          <span className="absolute text-[10px] font-medium">15</span>
        </Button>

        <Button
          onClick={togglePlay}
          className="flex size-16 items-center justify-center rounded-full bg-white border border-zinc-200 text-zinc-800 shadow-sm transition-all hover:shadow-md active:scale-95"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <PauseIcon className="size-7" weight="fill" />
          ) : (
            <PlayIcon className="size-7 ml-0.5" weight="fill" />
          )}
        </Button>

        <Button
          onClick={onSkipForward}
          className="relative flex size-14 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-zinc-700 hover:bg-zinc-100"
          aria-label="Skip forward 15 seconds"
        >
          <ArrowClockwiseIcon className="size-7" />
          <span className="absolute text-[10px] font-medium">15</span>
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
