// @vitest-environment jsdom
import { Toast } from "@base-ui/react/toast";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vite-plus/test";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import type { setting } from "@/livestore/setting";

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

const savePersonalityProfile = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/settings/personalityStorage", () => ({ savePersonalityProfile }));

beforeEach(() => {
  vi.clearAllMocks();
  state.settings = {
    customInstructions: "Always cite the source file.",
  };
  state.useQuery.mockImplementation((query: unknown) => {
    if (query === settingsDocumentQuery$) return state.settings;
    return undefined;
  });
});
afterEach(cleanup);

// The first import transforms a large module graph; keep that cost out of each test's budget.
const COLD_IMPORT_TIMEOUT = 60_000;

beforeAll(async () => {
  await import("@/pages/onboarding/index");
}, COLD_IMPORT_TIMEOUT);

test("re-completing onboarding preserves custom instructions already set in Settings", async () => {
  const { Component } = await import("@/pages/onboarding/index");
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Toast.Provider>
        <Component />
      </Toast.Provider>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByPlaceholderText("What should Memora call you?"), "Ada");
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(savePersonalityProfile).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      name: "Ada",
      customInstructions: "Always cite the source file.",
    }),
  );
}, 30000);

test("goes from welcome straight to personalize without asking for a provider", async () => {
  const { Component } = await import("@/pages/onboarding/index");
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Toast.Provider>
        <Component />
      </Toast.Provider>
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "Welcome to Memora" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Personalize Memora" })).toBeTruthy();
}, 30000);

test("skips the transcription trial when WebGPU is unavailable", async () => {
  const { Component } = await import("@/pages/onboarding/index");
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Toast.Provider>
        <Component />
      </Toast.Provider>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByPlaceholderText("What should Memora call you?"), "Ada");
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.queryByRole("heading", { name: "Choose transcription speed" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Setup complete" })).toBeTruthy();
}, 30000);
