import { CheckCircleIcon, MicrophoneIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  IDLE_START_BUTTON_RIPPLES,
  SAVE_SECONDARY_HANDOFF_MS,
  TRANSCRIPTION_CONTROLS_EASE,
  type TranscriptionControlsMode,
  getTranscriptionControlsDockState,
} from "@/components/transcript/transcriptionControlMotion";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  controls: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    paddingInline: "0.5rem",
    pointerEvents: "none",
    width: "100%",
  },
  group: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.5rem",
    pointerEvents: "auto",
  },
  alignCenter: { justifyContent: "center" },
  alignEnd: { justifyContent: "flex-end" },
  primaryFrame: { isolation: "isolate", position: "relative" },
  rippleFrame: { inset: "-0.45rem", pointerEvents: "none", position: "absolute", zIndex: -10 },
  ripple: {
    backgroundColor: "rgb(248 113 113 / 0.16)",
    borderColor: "rgb(248 113 113 / 0.55)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 2,
    inset: 0,
    position: "absolute",
  },
  primaryButton: {
    alignItems: "center",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.5rem",
    justifyContent: "center",
    lineHeight: "1.25rem",
    whiteSpace: "nowrap",
  },
  recordingButton: {
    backgroundColor: { default: tokens.surface, ":hover": tokens.hoverStrong },
    borderColor: tokens.border,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowSmall,
    color: tokens.text,
    fontWeight: 500,
    outline: "none",
    paddingBlock: "0.625rem",
    paddingInline: "0.875rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color",
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens.focusRing}` },
  },
  savingButton: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowSmall,
    color: tokens.text,
    fontWeight: 500,
    paddingBlock: "0.625rem",
    paddingInline: "1rem",
  },
  savedButton: {
    color: tokens.successText,
    fontWeight: 500,
    paddingBlock: "0.625rem",
    paddingInline: "1rem",
  },
  // Recording (red) and save (green) stay their own saturated brand colors in both themes --
  // the action's meaning (stop/danger, confirm/success) matters more here than surface tone, and
  // white text on either reads fine on light or dark chrome. Only the focus-ring gap (which must
  // match the surrounding surface) and ambient shadow come from tokens.
  idleButton: {
    backgroundColor: { default: "#ef4444", ":hover": "#dc2626", ":disabled": "#fecaca" },
    borderColor: "rgb(239 68 68 / 0.3)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowSmall,
    color: { default: "white", ":disabled": "#b91c1c" },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    fontWeight: 600,
    letterSpacing: "0.01em",
    paddingBlock: "0.75rem",
    paddingInline: "1.25rem",
    position: "relative",
    transitionDuration: "200ms",
    transitionProperty: "background-color, transform",
    userSelect: "none",
    ":active": { transform: "scale(0.985)" },
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens.surface}, 0 0 0 4px #ef4444` },
  },
  label: { alignItems: "center", display: "flex", gap: "0.5rem", whiteSpace: "nowrap" },
  saveButton: {
    alignItems: "center",
    backgroundColor: { default: "#059669", ":hover": "#047857" },
    borderRadius: "9999px",
    boxShadow: tokens.shadowSmall,
    color: "white",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.625rem",
    paddingInline: "0.875rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color",
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens.surface}, 0 0 0 4px #059669` },
  },
  icon: { height: "1rem", width: "1rem" },
  iconFrame: {
    alignItems: "center",
    display: "flex",
    height: "1rem",
    justifyContent: "center",
    width: "1rem",
  },
  spinner: {
    borderColor: tokens.borderStrong,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderTopColor: tokens.text,
    borderWidth: 2,
    height: "1rem",
    width: "1rem",
  },
  invisible: { visibility: "hidden" },
  unselectable: { userSelect: "none" },
  visuallyHidden: {
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});

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
  const alignmentStyle = dockState.alignment === "end" ? styles.alignEnd : styles.alignCenter;

  return (
    <motion.div
      layout={dockState.layout}
      transition={dockState.transition}
      {...stylex.props(styles.controls, alignmentStyle)}
    >
      <LayoutGroup id="transcription-controls">
        <motion.div
          layout={dockState.layout}
          transition={dockState.transition}
          {...stylex.props(styles.group, alignmentStyle)}
        >
          <motion.div
            layout
            layoutId={PRIMARY_CONTROL_LAYOUT_ID}
            transition={dockState.transition}
            {...stylex.props(styles.primaryFrame)}
          >
            {controlMode === "idle" && (
              <div {...stylex.props(styles.rippleFrame)}>
                {IDLE_START_BUTTON_RIPPLES.map((ripple, index) => (
                  <motion.span
                    key={index}
                    aria-hidden="true"
                    {...stylex.props(styles.ripple)}
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
              {...stylex.props(styles.primaryButton, getPrimaryButtonStyle(controlMode))}
              disabled={controlMode === "idle" ? !isReady : false}
            >
              <motion.span layoutId={PRIMARY_LABEL_LAYOUT_ID} {...stylex.props(styles.label)}>
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
                <Button onClick={onFinalize} {...stylex.props(styles.saveButton)}>
                  <CheckCircleIcon {...stylex.props(styles.icon)} weight="fill" />
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

function getPrimaryButtonStyle(controlMode: TranscriptionControlsMode) {
  switch (controlMode) {
    case "recording":
      return styles.recordingButton;
    case "saving":
      return styles.savingButton;
    case "saved":
      return styles.savedButton;
    case "idle":
    default:
      return styles.idleButton;
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
            <PlayIcon {...stylex.props(styles.icon)} weight="fill" />
          ) : (
            <PauseIcon {...stylex.props(styles.icon)} weight="fill" />
          )}
          <span>{paused ? "Resume" : "Pause"}</span>
        </>
      );
    case "saving":
      return (
        <>
          <span {...stylex.props(styles.iconFrame)}>
            <motion.span
              aria-hidden="true"
              {...stylex.props(styles.spinner)}
              animate={prefersReducedMotion ? undefined : { rotate: 360 }}
              transition={{
                duration: 0.85,
                ease: "linear",
                repeat: Number.POSITIVE_INFINITY,
              }}
            />
          </span>
          <span aria-hidden="true" {...stylex.props(styles.invisible, styles.unselectable)}>
            {SAVED_STATUS_LABEL}
          </span>
          <span {...stylex.props(styles.visuallyHidden)}>Saving recording</span>
        </>
      );
    case "saved":
      return (
        <>
          <span {...stylex.props(styles.iconFrame)}>
            <CheckCircleIcon {...stylex.props(styles.icon)} weight="fill" />
          </span>
          <span>{SAVED_STATUS_LABEL}</span>
        </>
      );
    case "idle":
    default:
      return (
        <>
          <MicrophoneIcon {...stylex.props(styles.icon)} weight="fill" />
          <span>Start Recording</span>
        </>
      );
  }
}
