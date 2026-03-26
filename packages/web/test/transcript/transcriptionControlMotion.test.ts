import { readFileSync } from "node:fs";

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
    alignmentClassName: "justify-center",
    layout: true,
    transition: {
      duration: 0.48,
      ease: TRANSCRIPTION_CONTROLS_EASE,
    },
  });

  expect(getTranscriptionControlsDockState(true, false)).toEqual({
    alignmentClassName: "justify-end",
    layout: true,
    transition: {
      duration: 0.48,
      ease: TRANSCRIPTION_CONTROLS_EASE,
    },
  });
});

test("disables positional layout animation when reduced motion is preferred", () => {
  expect(getTranscriptionControlsDockState(false, true)).toEqual({
    alignmentClassName: "justify-center",
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

test("keeps the settings row and recording controls in a single ready-state rail", () => {
  const livePageSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptLivePage.tsx", import.meta.url),
    "utf8",
  );

  expect(livePageSource).toContain('className="relative flex min-h-[3.75rem] items-center"');
  expect(livePageSource).toContain(
    'className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center"',
  );
});

test("uses a restrained shadow for the idle start button", () => {
  const controlsSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptionControls.tsx", import.meta.url),
    "utf8",
  );

  expect(controlsSource).toContain("shadow-sm");
  expect(controlsSource).not.toContain("shadow-[0_14px_30px_rgba(220,38,38,0.24)]");
  expect(controlsSource).toContain(
    'className="absolute inset-0 rounded-full border-2 border-red-400/55 bg-red-400/16"',
  );
});

test("does not let the overlay rail swallow clicks meant for settings", () => {
  const controlsSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptionControls.tsx", import.meta.url),
    "utf8",
  );

  expect(controlsSource).toContain('"pointer-events-none flex w-full items-center gap-3 px-2"');
  expect(controlsSource).toContain('"pointer-events-auto flex shrink-0 items-center gap-2"');
  expect(controlsSource).toContain('className="relative isolate"');
  expect(controlsSource).not.toContain('"pointer-events-auto flex w-full items-center gap-3 px-2"');
});

test("morphs the centered start button into the right-docked recording controls instead of fading it out", () => {
  const controlsSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptionControls.tsx", import.meta.url),
    "utf8",
  );

  expect(controlsSource).toContain("LayoutGroup");
  expect(controlsSource).toContain('from "motion/react";');
  expect(controlsSource).toContain('<LayoutGroup id="transcription-controls">');
  expect(controlsSource).toContain(
    'const PRIMARY_CONTROL_LAYOUT_ID = "transcription-primary-control"',
  );
  expect(controlsSource).toContain('const PRIMARY_LABEL_LAYOUT_ID = "transcription-primary-label"');
  expect(controlsSource).toContain("layoutId={PRIMARY_CONTROL_LAYOUT_ID}");
  expect(controlsSource).toContain("layoutId={PRIMARY_LABEL_LAYOUT_ID}");
  expect(controlsSource).toContain("SAVE_SECONDARY_HANDOFF_MS / 1000");
  expect(controlsSource).not.toContain('mode="popLayout"');
  expect(controlsSource).not.toContain(": { opacity: 0, x: 44, scale: 0.98 }");
});

test("drives the live page rail through delayed waveform and redirect timing", () => {
  const livePageSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptLivePage.tsx", import.meta.url),
    "utf8",
  );

  expect(livePageSource).toContain("SAVE_SUCCESS_REDIRECT_DELAY_MS");
  expect(livePageSource).toContain("START_WAVEFORM_REVEAL_DELAY_MS");
  expect(livePageSource).toContain("FINALIZE_WAVEFORM_EXIT_MS");
  expect(livePageSource).toContain("<motion.div");
  expect(livePageSource).toContain("layoutState.showVisualizer");
  expect(livePageSource).toContain("controlMode={layoutState.controlMode}");
  expect(livePageSource).toContain("dockedRight={layoutState.dockedRight}");
  expect(livePageSource).toContain("showSecondaryControl={layoutState.showSecondaryControl}");
  expect(livePageSource).toContain("SAVE_SUCCESS_SETTLE_MS");
  expect(livePageSource).toContain("SAVE_SECONDARY_HANDOFF_MS");
  expect(livePageSource).toContain("savedTimerRef");
  expect(livePageSource).toContain('setRailPhase("recentering")');
  expect(livePageSource).toContain("recenteringTimerRef");
  expect(livePageSource).toContain("window.setTimeout(() => {");
  expect(livePageSource).not.toContain('if (saveStatus === "success" && lastSavedId) {');
});

test("starts the waveform reveal timer immediately when recording is requested", () => {
  const livePageSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptLivePage.tsx", import.meta.url),
    "utf8",
  );

  const timerStartIndex = livePageSource.indexOf(
    "startRevealTimerRef.current = window.setTimeout(",
  );
  const awaitStartIndex = livePageSource.indexOf("await handleStartRecording();");

  expect(timerStartIndex).toBeGreaterThan(-1);
  expect(awaitStartIndex).toBeGreaterThan(-1);
  expect(timerStartIndex).toBeLessThan(awaitStartIndex);
});

test("renders saving and saved control modes through the shared primary control path", () => {
  const controlsSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptionControls.tsx", import.meta.url),
    "utf8",
  );

  expect(controlsSource).toContain("controlMode: TranscriptionControlsMode;");
  expect(controlsSource).toContain("dockedRight");
  expect(controlsSource).toContain("showSecondaryControl");
  expect(controlsSource).toContain('case "saving"');
  expect(controlsSource).toContain('case "saved"');
  expect(controlsSource).toContain("layoutId={PRIMARY_CONTROL_LAYOUT_ID}");
  expect(controlsSource).toContain('const SAVED_STATUS_LABEL = "Saved";');
  expect(controlsSource).toContain("Saving recording");
  expect(controlsSource).toContain('className="invisible select-none"');
  expect(controlsSource).toContain("{SAVED_STATUS_LABEL}");
  expect(controlsSource).not.toContain("{ x: -3 }");
  expect(controlsSource).not.toContain('width: "auto"');
  expect(controlsSource).not.toContain('key="recording-controls"');
  expect(controlsSource).not.toContain('key="saving-control"');
});
