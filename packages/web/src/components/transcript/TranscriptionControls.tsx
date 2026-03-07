import {
  MicrophoneIcon,
  PauseIcon,
  PlayIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";

interface TranscriptionControlsProps {
  recording: boolean;
  paused: boolean;
  saveStatus: "idle" | "saving" | "success";
  onReset: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinalize: () => void;
  isReady?: boolean;
}

export const TranscriptionControls = ({
  recording,
  paused,
  saveStatus,
  // onReset,
  onStart,
  onPause,
  onResume,
  onFinalize,
  isReady,
}: TranscriptionControlsProps) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* <Button
        onClick={onReset}
        className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 outline-none"
      >
        <ArrowClockwiseIcon className="size-4" />
        <span>Reset</span>
      </Button> */}

      {!recording ? (
        <Button
          onClick={onStart}
          className="flex items-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform active:scale-95 hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:bg-red-200 disabled:text-red-700 disabled:cursor-not-allowed"
          disabled={!isReady}
        >
          <MicrophoneIcon className="size-4" weight="fill" />
          <span>Start Recording</span>
        </Button>
      ) : (
        <>
          <Button
            onClick={paused ? onResume : onPause}
            className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 outline-none"
          >
            {paused ? (
              <PlayIcon className="size-4" weight="fill" />
            ) : (
              <PauseIcon className="size-4" weight="fill" />
            )}
            <span>{paused ? "Resume" : "Pause"}</span>
          </Button>
          <Button
            onClick={onFinalize}
            disabled={saveStatus === "saving"}
            className="flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-transform active:scale-95 hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:bg-emerald-200 disabled:text-emerald-700 disabled:cursor-not-allowed"
          >
            <CheckCircleIcon className="size-4" weight="fill" />
            <span>
              {saveStatus === "saving" ? "Saving..." : "Save Recording"}
            </span>
          </Button>
        </>
      )}
      <div className="ml-2 flex items-center gap-3 text-xs text-zinc-500">
        {saveStatus === "saving" && (
          <div className="flex items-center gap-2 text-emerald-600">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            Saving recording...
          </div>
        )}
        {saveStatus === "success" && (
          <div className="text-emerald-600">Saved successfully.</div>
        )}
      </div>
    </div>
  );
};
