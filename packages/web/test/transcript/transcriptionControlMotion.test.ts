import { expect, test } from "vite-plus/test";

import {
  FINALIZE_WAVEFORM_EXIT_MS,
  IDLE_START_BUTTON_RIPPLES,
  SAVE_SECONDARY_HANDOFF_MS,
  SAVE_SUCCESS_SETTLE_MS,
  SAVE_SUCCESS_REDIRECT_DELAY_MS,
  START_WAVEFORM_REVEAL_DELAY_MS,
  TRANSCRIPTION_CONTROLS_EASE,
  getTranscriptionRailState,
  getTranscriptionControlsDockState,
} from "@/components/transcript/transcriptionControlMotion";

test("centers the start control before recording and docks controls to the end once recording starts", () => {
  expect(getTranscriptionControlsDockState(false, false)).toEqual({
    alignment: "center",
    layout: true,
    transition: {
      duration: 0.48,
      ease: TRANSCRIPTION_CONTROLS_EASE,
    },
  });

  expect(getTranscriptionControlsDockState(true, false)).toEqual({
    alignment: "end",
    layout: true,
    transition: {
      duration: 0.48,
      ease: TRANSCRIPTION_CONTROLS_EASE,
    },
  });
});

test("disables positional layout animation when reduced motion is preferred", () => {
  expect(getTranscriptionControlsDockState(false, true)).toEqual({
    alignment: "center",
    layout: false,
    transition: {
      duration: 0.12,
    },
  });
});

test("uses the intended transcription rail timing constants", () => {
  expect(START_WAVEFORM_REVEAL_DELAY_MS).toBe(240);
  expect(FINALIZE_WAVEFORM_EXIT_MS).toBe(180);
  expect(SAVE_SECONDARY_HANDOFF_MS).toBe(120);
  expect(SAVE_SUCCESS_SETTLE_MS).toBe(180);
  expect(SAVE_SUCCESS_REDIRECT_DELAY_MS).toBe(600);
});

test("maps each rail phase to the expected visual arrangement", () => {
  expect(getTranscriptionRailState("idle")).toEqual({
    controlMode: "idle",
    dockedRight: false,
    showSecondaryControl: false,
    showVisualizer: false,
  });

  expect(getTranscriptionRailState("starting")).toEqual({
    controlMode: "recording",
    dockedRight: true,
    showSecondaryControl: false,
    showVisualizer: false,
  });

  expect(getTranscriptionRailState("recording")).toEqual({
    controlMode: "recording",
    dockedRight: true,
    showSecondaryControl: true,
    showVisualizer: true,
  });

  expect(getTranscriptionRailState("finalizing")).toEqual({
    controlMode: "recording",
    dockedRight: true,
    showSecondaryControl: true,
    showVisualizer: false,
  });

  expect(getTranscriptionRailState("recentering")).toEqual({
    controlMode: "saving",
    dockedRight: false,
    showSecondaryControl: true,
    showVisualizer: false,
  });

  expect(getTranscriptionRailState("saving")).toEqual({
    controlMode: "saving",
    dockedRight: false,
    showSecondaryControl: false,
    showVisualizer: false,
  });

  expect(getTranscriptionRailState("saved")).toEqual({
    controlMode: "saved",
    dockedRight: false,
    showSecondaryControl: false,
    showVisualizer: false,
  });
});

test("defines two expanding red ripples for the idle start button", () => {
  expect(IDLE_START_BUTTON_RIPPLES).toHaveLength(2);
  expect(IDLE_START_BUTTON_RIPPLES).toEqual([
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
  ]);
});
