// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { useProviderModelCatalog } from "@/hooks/settings/useProviderModelCatalog";
import { parseProviderModel } from "@/lib/settings/dialogHelpers";
import { settingsProvidersQuery$ } from "@/lib/settings/queries";
import type { provider as ProviderRow } from "@/livestore/provider";
import type { ModelInfo } from "@/types/settingsDialog";

const mocks = vi.hoisted(() => ({
  fetchModels: vi.fn<() => Promise<ModelInfo[]>>(),
  store: { query: vi.fn(), commit: vi.fn() },
}));
vi.mock("@/livestore/store", () => ({ useAppStore: () => mocks.store }));
vi.mock("@/lib/settings/providerModels", () => ({ fetchProviderModels: mocks.fetchModels }));

const provider: ProviderRow = {
  id: "cloud",
  name: "Cloud",
  baseUrl: "https://example.test/v1",
  apiFormat: "responses",
  models: JSON.stringify([{ id: "saved" }]),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};
const models = [parseProviderModel({ id: "fresh" })].filter((model): model is ModelInfo => !!model);
let currentProvider = provider;
let currentKey = "device-key";
beforeEach(() => {
  vi.clearAllMocks();
  currentProvider = provider;
  currentKey = "device-key";
  mocks.fetchModels.mockResolvedValue(models);
  mocks.store.query.mockImplementation((query) =>
    query === settingsProvidersQuery$
      ? [currentProvider]
      : [{ providerId: currentProvider.id, baseUrl: currentProvider.baseUrl, apiKey: currentKey }],
  );
});
afterEach(cleanup);

test("automatically loads the selected provider and commits only parsed model metadata", async () => {
  const { result, rerender } = renderHook(() => useProviderModelCatalog(provider, currentKey));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mocks.fetchModels).toHaveBeenCalledExactlyOnceWith(provider.baseUrl, currentKey);
  expect(result.current.models).toEqual(models);
  expect(mocks.store.commit).toHaveBeenCalledOnce();
  const [event] = mocks.store.commit.mock.calls[0];
  expect(event.args).toMatchObject({ id: provider.id, models: JSON.stringify(models) });
  expect(JSON.stringify(event)).not.toContain("device-key");
  rerender();
  expect(mocks.fetchModels).toHaveBeenCalledOnce();
});

test("does not fetch for local or inherited rows", () => {
  const { result } = renderHook(() => useProviderModelCatalog(undefined, ""));
  expect(result.current.loading).toBe(false);
  expect(mocks.fetchModels).not.toHaveBeenCalled();
});

test("retains cached models after failure and retries on request", async () => {
  mocks.fetchModels.mockRejectedValueOnce(new Error("network unavailable"));
  const { result } = renderHook(() => useProviderModelCatalog(provider, currentKey));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.models[0]?.id).toBe("saved");
  expect(mocks.store.commit).not.toHaveBeenCalled();
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.error).toBeNull());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.models).toEqual(models);
});

test("ignores a stale response after switching providers", async () => {
  let resolveOld: (models: ModelInfo[]) => void = () => {};
  mocks.fetchModels.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  const { result, rerender } = renderHook(
    ({ selected }) => useProviderModelCatalog(selected, currentKey),
    {
      initialProps: { selected: provider },
    },
  );
  currentProvider = { ...provider, id: "other", baseUrl: "https://other.test/v1" };
  rerender({ selected: currentProvider });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => resolveOld([]));
  expect(result.current.models).toEqual(models);
  expect(mocks.store.commit).toHaveBeenCalledOnce();
  expect(mocks.store.commit.mock.calls[0][0].args.id).toBe("other");
});

test("reloads after a device credential change", async () => {
  const { result, rerender } = renderHook(() => useProviderModelCatalog(provider, currentKey));
  await waitFor(() => expect(result.current.loading).toBe(false));
  currentKey = "replacement-key";
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mocks.fetchModels).toHaveBeenLastCalledWith(provider.baseUrl, "replacement-key");
  expect(mocks.fetchModels).toHaveBeenCalledTimes(2);
});
