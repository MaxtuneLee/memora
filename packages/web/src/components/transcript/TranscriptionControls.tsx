import { CheckCircleIcon, MicrophoneIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  IDLE_START_BUTTON_RIPPLES,
  SAVE_SECONDARY_HANDOFF_MS,
  TRANSCRIPTION_CONTROLS_EASE,
  type TranscriptionControlsMode,
  getTranscriptionControlsDockState,
} from "@/components/transcript/transcriptionControlMotion";
import { cn } from "@/lib/cn";

interface TranscriptionControlsProps {
  controlMode: TranscriptionControlsMode;
  dockedRight: boolean;
  showSecondaryControl: boolean;
  paused: boolean;
  onStart: () => void | Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onFinalize: () => void;
  isReady?: boolean;
}

const PRIMARY_CONTROL_LAYOUT_ID = "transcription-primary-control";
const PRIMARY_LABEL_LAYOUT_ID = "transcription-primary-label";
const SAVED_STATUS_LABEL = "Saved";

export const TranscriptionControls = ({
  controlMode,
  dockedRight,
  showSecondaryControl,
  paused,
  onStart,
  onPause,
  onResume,
  onFinalize,
  isReady,
}: TranscriptionControlsProps) => {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const dockState = getTranscriptionControlsDockState(dockedRight, prefersReducedMotion);
  const rippleEase = "ease" in dockState.transition ? dockState.transition.ease : "easeOut";
  const secondaryControlExitTransition = {
    duration: prefersReducedMotion ? 0.1 : SAVE_SECONDARY_HANDOFF_MS / 1000,
    ease: TRANSCRIPTION_CONTROLS_EASE,
  };
  const primaryButtonClassName = getPrimaryButtonClassName(controlMode);

  return (
    <motion.div
      layout={dockState.layout}
      transition={dockState.transition}
      className={cn(
        "pointer-events-none flex w-full items-center gap-3 px-2",
        dockState.alignmentClassName,
      )}
    >
      <LayoutGroup id="transcription-controls">
        <motion.div
          layout={dockState.layout}
          transition={dockState.transition}
          className={cn(
            "pointer-events-auto flex shrink-0 items-center gap-2",
            dockState.alignmentClassName,
          )}
        >
          <motion.div
            layout
            layoutId={PRIMARY_CONTROL_LAYOUT_ID}
            transition={dockState.transition}
            className="relative isolate"
          >
            {controlMode === "idle" && (
              <div className="pointer-events-none absolute inset-[-0.45rem] -z-10">
                {IDLE_START_BUTTON_RIPPLES.map((ripple, index) => (
                  <motion.span
                    key={index}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border-2 border-red-400/55 bg-red-400/16"
                    animate={
                      prefersReducedMotion
                        ? { opacity: 0.28, scale: 1.04 }
                        : {
                            opacity: ripple.opacity,
                            scale: ripple.scale,
                          }
                    }
                    transition={{
                      duration: prefersReducedMotion ? 0.12 : 2.2,
                      delay: prefersReducedMotion ? 0 : ripple.delay,
                      repeat: prefersReducedMotion ? 0 : Number.POSITIVE_INFINITY,
                      ease: rippleEase,
                    }}
                    style={{ transformOrigin: "center center" }}
                  />
                ))}
              </div>
            )}

            <Button
              onClick={getPrimaryButtonHandler({
                controlMode,
                onPause,
                onResume,
                onStart,
                paused,
              })}
              className={primaryButtonClassName}
              disabled={controlMode === "idle" ? !isReady : false}
            >
              <motion.span
                layoutId={PRIMARY_LABEL_LAYOUT_ID}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                {renderPrimaryContent({
                  controlMode,
                  paused,
                  prefersReducedMotion,
                })}
              </motion.span>
            </Button>
          </motion.div>

          <AnimatePresence initial={false}>
            {showSecondaryControl && (
              <motion.div
                key="secondary-save-control"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92, x: -10 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: 0,
                  transition: dockState.transition,
                }}
                exit={{
                  opacity: 0,
                  scale: prefersReducedMotion ? 1 : 0.94,
                  x: prefersReducedMotion ? 0 : 14,
                  transition: secondaryControlExitTransition,
                }}
              >
                <Button
                  onClick={onFinalize}
                  className="flex items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                >
                  <CheckCircleIcon className="size-4" weight="fill" />
                  <span>Save Recording</span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </motion.div>
  );
};

function getPrimaryButtonHandler({
  controlMode,
  onPause,
  onResume,
  onStart,
  paused,
}: {
  controlMode: TranscriptionControlsMode;
  onPause: () => void;
  onResume: () => void;
  onStart: () => void | Promise<void>;
  paused: boolean;
}) {
  switch (controlMode) {
    case "recording":
      return paused ? onResume : onPause;
    case "idle":
      return () => {
        void onStart();
      };
    case "saving":
    case "saved":
    default:
      return undefined;
  }
}

function getPrimaryButtonClassName(controlMode: TranscriptionControlsMode): string {
  switch (controlMode) {
    case "recording":
      return "flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 outline-none";
    case "saving":
      return "flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm";
    case "saved":
      return "flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium text-emerald-600";
    case "idle":
    default:
      return "select-none cursor-pointer relative flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-red-500/30 bg-red-500 px-5 py-3 text-sm font-semibold tracking-[0.01em] text-white shadow-sm transition-colors duration-200 hover:bg-red-600 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-red-200 disabled:text-red-700";
  }
}

function renderPrimaryContent({
  controlMode,
  paused,
  prefersReducedMotion,
}: {
  controlMode: TranscriptionControlsMode;
  paused: boolean;
  prefersReducedMotion: boolean;
}) {
  switch (controlMode) {
    case "recording":
      return (
        <>
          {paused ? (
            <PlayIcon className="size-4" weight="fill" />
          ) : (
            <PauseIcon className="size-4" weight="fill" />
          )}
          <span>{paused ? "Resume" : "Pause"}</span>
        </>
      );
    case "saving":
      return (
        <>
          <span className="flex size-4 items-center justify-center">
            <motion.span
              aria-hidden="true"
              className="size-4 rounded-full border-2 border-zinc-300 border-t-zinc-700"
              animate={prefersReducedMotion ? undefined : { rotate: 360 }}
              transition={{
                duration: 0.85,
                ease: "linear",
                repeat: Number.POSITIVE_INFINITY,
              }}
            />
          </span>
          <span aria-hidden="true" className="invisible select-none">
            {SAVED_STATUS_LABEL}
          </span>
          <span className="sr-only">Saving recording</span>
        </>
      );
    case "saved":
      return (
        <>
          <span className="flex size-4 items-center justify-center">
            <CheckCircleIcon className="size-4" weight="fill" />
          </span>
          <span>{SAVED_STATUS_LABEL}</span>
        </>
      );
    case "idle":
    default:
      return (
        <>
          <MicrophoneIcon className="size-4" weight="fill" />
          <span>Start Recording</span>
        </>
      );
  }
}
