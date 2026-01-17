import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { Slider } from "@base-ui/react/slider";
import { Button } from "@base-ui/react/button";
import { formatDuration } from "../../lib/format";

interface RecordingPlayerProps {
  audioRef: React.Ref<HTMLAudioElement>;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

export const RecordingPlayer = ({
  audioRef,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
}: RecordingPlayerProps) => {
  const clampedTime = Math.min(currentTime, duration || 0);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
      <audio ref={audioRef} className="hidden" />
      <div className="flex items-center gap-3">
        <Button
          onClick={onTogglePlay}
          className="flex size-10 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label={isPlaying ? "Pause playback" : "Play recording"}
        >
          {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
        </Button>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
          <Slider.Root
            value={clampedTime}
            min={0}
            max={duration || 0}
            step={0.1}
            onValueChange={(value) => onSeek(Number(value))}
            className="mt-2"
            aria-label="Seek recording"
          >
            <Slider.Control className="flex w-full touch-none items-center py-2 select-none">
              <Slider.Track className="relative h-1 w-full rounded-full bg-zinc-200 shadow-[inset_0_0_0_1px] shadow-zinc-200 select-none">
                <Slider.Indicator className="h-full rounded-full bg-zinc-900 transition-[width] duration-200 select-none" />
                <Slider.Thumb
                  className="size-3 rounded-full bg-white outline outline-1 outline-zinc-300 shadow-sm select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
                  aria-label="Seek"
                />
              </Slider.Track>
            </Slider.Control>
          </Slider.Root>
        </div>
      </div>
    </div>
  );
};
