// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vite-plus/test";

import { Component } from "@/components/transcript/TranscriptLivePage";

const state = vi.hoisted(() => ({ retry: vi.fn(), check: vi.fn(async () => false) }));
vi.mock("@/hooks/settings/useSettingsDialog", () => ({
  useSettingsDialog: () => ({ openSettings: vi.fn() }),
}));
vi.mock("@/hooks/transcript/useTranscript", () => ({
  useTranscript: () => ({
    isWebGpuAvailable: true,
    status: "error",
    loadingMessage:
      "Cloud transcription is selected, but its authenticated connection is not configured on this device.",
    progressItems: [],
    accumulatedText: "",
    currentSegmentPrefix: "",
    currentSegment: "",
    tps: null,
    stream: null,
    paused: false,
    saveStatus: "idle",
    lastSavedId: null,
    language: "en",
    isModelCached: true,
    isCheckingCache: false,
    lastSegmentDiagnostics: null,
    loadModel: state.retry,
    checkModelCache: state.check,
    updateLanguage: vi.fn(),
    handleStartRecording: vi.fn(),
    handlePauseRecording: vi.fn(),
    handleResumeRecording: vi.fn(),
    handleFinalizeRecording: vi.fn(),
  }),
}));

test("recording configuration errors are announced with a retry action instead of a download prompt", () => {
  render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("authenticated connection is not configured");
  expect(screen.getByText("Transcription unavailable")).toBeInTheDocument();
  expect(
    screen.queryByText("Finishing model preparation before recording."),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(state.retry).toHaveBeenCalledOnce();
});
