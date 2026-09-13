// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import AppLayout from "@/app/layouts/AppLayout";

vi.mock("@/app/components/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/search/SearchPalette", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsDialog", () => ({ default: () => null }));
vi.mock("@/components/devtools/LocalModelDevtoolsPanel", () => ({
  LocalModelDevtoolsPanel: () => null,
}));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

const state = vi.hoisted(() => ({ settings: { onboardingCompleted: false } }));
vi.mock("@/livestore/store", () => ({
  useAppStore: () => ({ useQuery: () => state.settings }),
}));

const gate = vi.hoisted(() => ({
  status: vi.fn(async (completed: boolean) => ({ ready: completed })),
}));
vi.mock("@/lib/onboarding/onboardingGate", () => ({
  getOnboardingGateStatus: (completed: boolean) => gate.status(completed),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.settings = { onboardingCompleted: false };
  gate.status.mockImplementation(async (completed: boolean) => ({ ready: completed }));
});
afterEach(cleanup);

const waitForGateReady = async () => {
  await waitFor(() => expect(screen.queryByText("Preparing your workspace...")).toBeNull());
};

test("does not bounce away from onboarding just because it completed mid-flow", async () => {
  const { rerender } = render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <AppLayout />
    </MemoryRouter>,
  );
  await waitForGateReady();
  expect(navigateMock).not.toHaveBeenCalledWith("/", expect.anything());

  state.settings = { onboardingCompleted: true };
  rerender(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <AppLayout />
    </MemoryRouter>,
  );
  await waitForGateReady();

  expect(navigateMock).not.toHaveBeenCalledWith("/", expect.anything());
});

test("bounces to home when visiting onboarding while already complete", async () => {
  state.settings = { onboardingCompleted: true };
  render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <AppLayout />
    </MemoryRouter>,
  );
  await waitForGateReady();

  expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
});

test("forces an incomplete session into onboarding from any other route", async () => {
  state.settings = { onboardingCompleted: false };
  render(
    <MemoryRouter initialEntries={["/"]}>
      <AppLayout />
    </MemoryRouter>,
  );
  await waitForGateReady();

  expect(navigateMock).toHaveBeenCalledWith("/onboarding", { replace: true });
});
