export const TRANSCRIPTION_CONTROLS_EASE = [0.22, 1, 0.36, 1] as const;
export const START_WAVEFORM_REVEAL_DELAY_MS = 240;
export const FINALIZE_WAVEFORM_EXIT_MS = 180;
export const SAVE_SECONDARY_HANDOFF_MS = 120;
export const SAVE_SUCCESS_SETTLE_MS = 180;
export const SAVE_SUCCESS_REDIRECT_DELAY_MS = 600;

interface StartButtonRipple {
  delay: number;
  opacity: [number, number, number];
  scale: [number, number, number];
}

export type TranscriptionControlsMode = "idle" | "recording" | "saving" | "saved";

export type TranscriptionRailPhase =
  | "idle"
  | "starting"
  | "recording"
  | "finalizing"
  | "recentering"
  | "saving"
  | "saved";

export const IDLE_START_BUTTON_RIPPLES = [
  {
    delay: 0,
    opacity: [0.34, 0.1, 0],
    scale: [0.96, 1.18, 1.28],
  },
  {
    delay: 0.9,
    opacity: [0, 0.28, 0],
    scale: [0.9, 1.14, 1.36],
  },
] satisfies StartButtonRipple[];

interface TranscriptionRailState {
  controlMode: TranscriptionControlsMode;
  dockedRight: boolean;
  showSecondaryControl: boolean;
  showVisualizer: boolean;
}

export function getTranscriptionRailState(phase: TranscriptionRailPhase): TranscriptionRailState {
  switch (phase) {
    case "starting":
      return {
        controlMode: "recording",
        dockedRight: true,
        showSecondaryControl: false,
        showVisualizer: false,
      };
    case "recording":
      return {
        controlMode: "recording",
        dockedRight: true,
        showSecondaryControl: true,
        showVisualizer: true,
      };
    case "finalizing":
      return {
        controlMode: "recording",
        dockedRight: true,
        showSecondaryControl: true,
        showVisualizer: false,
      };
    case "recentering":
      return {
        controlMode: "saving",
        dockedRight: false,
        showSecondaryControl: true,
        showVisualizer: false,
      };
    case "saving":
      return {
        controlMode: "saving",
        dockedRight: false,
        showSecondaryControl: false,
        showVisualizer: false,
      };
    case "saved":
      return {
        controlMode: "saved",
        dockedRight: false,
        showSecondaryControl: false,
        showVisualizer: false,
      };
    case "idle":
    default:
      return {
        controlMode: "idle",
        dockedRight: false,
        showSecondaryControl: false,
        showVisualizer: false,
      };
  }
}

interface TranscriptionControlsDockState {
  alignmentClassName: "justify-center" | "justify-end";
  layout: boolean;
  transition:
    | {
        duration: number;
        ease: typeof TRANSCRIPTION_CONTROLS_EASE;
      }
    | {
        duration: number;
      };
}

export function getTranscriptionControlsDockState(
  dockedRight: boolean,
  prefersReducedMotion: boolean,
): TranscriptionControlsDockState {
  const dockClassName = dockedRight ? "justify-end" : "justify-center";

  return {
    alignmentClassName: dockClassName,
    layout: !prefersReducedMotion,
    transition: prefersReducedMotion
      ? {
          duration: 0.12,
        }
      : {
          duration: 0.48,
          ease: TRANSCRIPTION_CONTROLS_EASE,
        },
  };
}
