// @vitest-environment jsdom
import { Toast } from "@base-ui/react/toast";
import { nemotron35AsrStreamingManifest } from "@memora/local-model-runtime";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vite-plus/test";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import type { setting } from "@/livestore/setting";

vi.mock("@/lib/settings/personalityStorage", () => ({
  savePersonalityProfile: vi.fn(async () => {}),
}));

const mocks = vi.hoisted(() => ({
  transcript: {
    isWebGpuAvailable: true,
    status: null as string | null,
    loadingMessage: "",
    progressItems: [] as { file: string; progress: number }[],
    accumulatedText: "",
    currentSegmentPrefix: "",
    currentSegment: "",
    tps: null as number | null,
    stream: null as MediaStream | null,
    recording: false,
    paused: false,
    saveStatus: "idle" as "idle" | "saving" | "success",
    lastSavedId: null as string | null,
    language: "en",
    isModelCached: false,
    isCheckingCache: false,
    lastSegmentDiagnostics: null,
    loadModel: vi.fn(),
    updateLanguage: vi.fn(),
    checkModelCache: vi.fn(async () => false),
    handleStartRecording: vi.fn(async () => {}),
    handlePauseRecording: vi.fn(),
    handleResumeRecording: vi.fn(),
    handleFinalizeRecording: vi.fn(),
    handleReset: vi.fn(),
  },
  recording: null as null | {
    id: string;
    type: "audio";
    transcript: { words: unknown[]; text: string };
  },
}));

vi.mock("@/hooks/transcript/useTranscript", () => ({
  useTranscript: () => mocks.transcript,
}));
vi.mock("@/hooks/transcript/useRecordingDetail", () => ({
  useRecordingDetail: () => ({
    recording: mocks.recording,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const state = vi.hoisted(() => ({
  settings: {} as Partial<setting>,
  commit: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("@/livestore/store", () => ({
  useAppStore: () => ({
    useQuery: state.useQuery,
    query: (query: unknown) => state.useQuery(query),
    commit: state.commit,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrollIntoView; the live transcript auto-scrolls with it.
  Element.prototype.scrollIntoView = vi.fn();
  state.settings = {};
  state.useQuery.mockImplementation((query: unknown) => {
    if (query === settingsDocumentQuery$) return state.settings;
    return undefined;
  });
  state.commit.mockImplementation((event: { args: { value: Partial<setting> } }) => {
    state.settings = { ...state.settings, ...event.args.value };
  });
  mocks.transcript.isWebGpuAvailable = true;
  mocks.transcript.status = null;
  mocks.transcript.progressItems = [];
  mocks.transcript.isModelCached = false;
  mocks.transcript.isCheckingCache = false;
  mocks.transcript.saveStatus = "idle";
  mocks.transcript.lastSavedId = null;
  mocks.recording = null;
});
afterEach(cleanup);

// The first import transforms a large module graph; keep that cost out of each test's budget.
const COLD_IMPORT_TIMEOUT = 60_000;

beforeAll(async () => {
  await import("@/pages/onboarding/index");
}, COLD_IMPORT_TIMEOUT);

const renderOnboarding = async () => {
  const { Component } = await import("@/pages/onboarding/index");
  return {
    Component,
    view: render(
      <MemoryRouter>
        <Toast.Provider>
          <Component />
        </Toast.Provider>
      </MemoryRouter>,
    ),
  };
};

const goToTranscriptionStep = async (user: ReturnType<typeof userEvent.setup>) => {
  const { Component, view } = await renderOnboarding();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByPlaceholderText("What should Memora call you?"), "Ada");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  return { Component, view };
};

test("shows the transcription mode step and gates Continue until the model is ready", async () => {
  const user = userEvent.setup();
  await goToTranscriptionStep(user);

  expect(screen.getByRole("heading", { name: "Choose transcription model" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
}, 30000);

test("shows download details for the selected model, defaulting to Fast", async () => {
  const user = userEvent.setup();
  await goToTranscriptionStep(user);

  expect(screen.getByRole("heading", { name: "Nemotron 3.5 ASR Streaming 0.6B" })).toBeTruthy();
}, 30000);

test("selecting a mode commits it to the transcription routing", async () => {
  const user = userEvent.setup();
  await goToTranscriptionStep(user);

  await user.click(screen.getByRole("button", { name: /^Fast/ }));

  expect(state.commit).toHaveBeenCalledWith(
    expect.objectContaining({
      args: expect.objectContaining({
        value: expect.objectContaining({
          modelRouting: expect.objectContaining({
            transcription: { source: "local", modelId: nemotron35AsrStreamingManifest.id },
          }),
        }),
      }),
    }),
  );
}, 30000);

test("continues to the live trial once the model is ready", async () => {
  mocks.transcript.status = "ready";
  const user = userEvent.setup();
  await goToTranscriptionStep(user);

  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Try real-time transcription" })).toBeTruthy();
}, 30000);

test("skip for now jumps straight to setup complete", async () => {
  const user = userEvent.setup();
  await goToTranscriptionStep(user);

  await user.click(screen.getByRole("button", { name: "Skip for now" }));
  expect(screen.getByRole("heading", { name: "Setup complete" })).toBeTruthy();
}, 30000);

test("auto-advances to playback once the trial recording is saved", async () => {
  mocks.transcript.status = "ready";
  const user = userEvent.setup();
  const { Component, view } = await goToTranscriptionStep(user);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Try real-time transcription" })).toBeTruthy();

  mocks.recording = { id: "rec-1", type: "audio", transcript: { words: [], text: "Hello world" } };
  mocks.transcript.saveStatus = "success";
  mocks.transcript.lastSavedId = "rec-1";
  view.rerender(
    <MemoryRouter>
      <Toast.Provider>
        <Component />
      </Toast.Provider>
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "Review your recording" })).toBeTruthy();
}, 30000);
