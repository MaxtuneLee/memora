// @vitest-environment jsdom
import { Toast } from "@base-ui/react/toast";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { providerCredentialsQuery$ } from "@/livestore/providerCredential";
import { settingsDocumentQuery$, settingsProvidersQuery$ } from "@/lib/settings/queries";
import type { setting } from "@/livestore/setting";

vi.mock("@/components/settings/FeatureModelSettings", () => ({ default: () => null }));
vi.mock("@/components/settings/ProviderManagementSection", () => ({ default: () => null }));

const state = vi.hoisted(() => ({
  settings: {} as Partial<setting>,
  providers: [] as { id: string; baseUrl: string }[],
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
    selectedProviderId: "p",
    selectedModel: "chat-model",
    customInstructions: "Always cite the source file.",
  };
  state.providers = [{ id: "p", baseUrl: "https://example.test/v1" }];
  state.useQuery.mockImplementation((query: unknown) => {
    if (query === settingsDocumentQuery$) return state.settings;
    if (query === settingsProvidersQuery$) return state.providers;
    if (query === providerCredentialsQuery$) return [];
    return undefined;
  });
});
afterEach(cleanup);

test(
  "re-completing onboarding preserves custom instructions already set in Settings",
  async () => {
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
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByPlaceholderText("What should Memora call you?"), "Ada");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(savePersonalityProfile).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "Ada",
        customInstructions: "Always cite the source file.",
      }),
    );
  },
  30000,
);

test(
  "skips the model step when no provider was configured, and back skips it too",
  async () => {
    state.providers = [];
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
    expect(screen.getByRole("heading", { name: "Connect a cloud provider" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Personalize Memora" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Connect a cloud provider" })).toBeTruthy();
  },
  30000,
);
