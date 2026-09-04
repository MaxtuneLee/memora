// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { defaultSettings } from "@/livestore/setting";
import { providerCredentialsQuery$ } from "@/livestore/providerCredential";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { useAiProviderSettings } from "@/hooks/settings/useAiProviderSettings";

const state = vi.hoisted(() => ({ commit: vi.fn(), useQuery: vi.fn(), add: vi.fn() }));
vi.mock("@/livestore/store", () => ({ useAppStore: () => state }));
vi.mock("@base-ui/react/toast", () => ({ Toast: { useToastManager: () => ({ add: state.add }) } }));

const provider = {
  id: "cloud",
  name: "Cloud",
  baseUrl: "https://example.test/v1",
  apiFormat: "responses" as const,
  models: "[]",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.useQuery.mockImplementation((query) => {
    if (query === settingsDocumentQuery$) return defaultSettings;
    if (query === providerCredentialsQuery$)
      return [{ providerId: provider.id, baseUrl: provider.baseUrl, apiKey: "device-key" }];
    return [provider];
  });
});

describe("provider settings credential boundary", () => {
  test("add commits metadata and credential as separate sync/local events", () => {
    const { result } = renderHook(() => useAiProviderSettings({ open: true }));
    act(() => result.current.handleAddProvider());
    act(() =>
      result.current.handleProviderFormChange({
        name: "New",
        baseUrl: provider.baseUrl,
        apiKey: "new-key",
      }),
    );
    act(() => result.current.handleSaveProvider());
    const [metadata, credential] = state.commit.mock.calls[0];
    expect(metadata.name).toBe("v2.ProviderCreated");
    expect(metadata.args).not.toHaveProperty("apiKey");
    expect(credential.name).toBe("v1.ProviderCredentialSet");
    expect(credential.args).toMatchObject({ providerId: metadata.args.id, apiKey: "new-key" });
  });

  test("edit loads device-local key and clearing it writes an empty local credential", () => {
    const { result } = renderHook(() => useAiProviderSettings({ open: true }));
    act(() => result.current.handleEditProvider(provider));
    expect(result.current.providerForm.apiKey).toBe("device-key");
    act(() => result.current.handleProviderFormChange({ apiKey: "" }));
    act(() => result.current.handleSaveProvider());
    const [metadata, credential] = state.commit.mock.calls[0];
    expect(metadata.name).toBe("v2.ProviderUpdated");
    expect(metadata.args).not.toHaveProperty("apiKey");
    expect(credential.args.apiKey).toBe("");
  });

  test("deleting a provider removes the credential too", () => {
    const { result } = renderHook(() => useAiProviderSettings({ open: true }));
    act(() => result.current.handleDeleteProvider(provider.id));
    expect(state.commit.mock.calls[0].map((event: { name: string }) => event.name)).toEqual([
      "v1.ProviderDeleted",
      "v1.ProviderCredentialDeleted",
    ]);
  });
});
