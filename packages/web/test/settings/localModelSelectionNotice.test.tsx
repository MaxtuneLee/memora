// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { useLocalModelSelectionNotice } from "@/hooks/settings/useLocalModelSelectionNotice";

const mock = vi.hoisted(() => ({
  cache: vi.fn<() => Promise<{ cached: boolean }>>(),
  add: vi.fn(),
}));
vi.mock("@base-ui/react/toast", () => ({ Toast: { useToastManager: () => ({ add: mock.add }) } }));
vi.mock("@/lib/local-model", () => ({
  getLocalModelCacheStatus: mock.cache,
  getLocalModelOptions: () => [{ id: "qwen", name: "Qwen" }],
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.cache.mockResolvedValue({ cached: false });
});
afterEach(cleanup);

test("downloaded models and cloud selections do not show a download warning", async () => {
  mock.cache.mockResolvedValue({ cached: true });
  const { result } = renderHook(() => useLocalModelSelectionNotice());
  await act(async () => result.current("personality", { source: "local", modelId: "qwen" }));
  act(() => result.current("sessionTitle", { source: "inherit", featureId: "assistant" }));
  expect(mock.cache).toHaveBeenCalledOnce();
  expect(mock.add).not.toHaveBeenCalled();
});

test("ignores stale checks after switching away from local or unmounting", async () => {
  let resolve: (value: { cached: boolean }) => void = () => {};
  mock.cache.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { result, unmount } = renderHook(() => useLocalModelSelectionNotice());
  act(() => result.current("personality", { source: "local", modelId: "qwen" }));
  act(() => result.current("personality", { source: "inherit", featureId: "assistant" }));
  await act(async () => resolve({ cached: false }));
  expect(mock.add).not.toHaveBeenCalled();
  act(() => result.current("personality", { source: "local", modelId: "qwen" }));
  unmount();
  await act(async () => resolve({ cached: false }));
  expect(mock.add).not.toHaveBeenCalled();
});

test("reports a failed cache check without claiming the model is missing", async () => {
  mock.cache.mockRejectedValue(new Error("OPFS unavailable"));
  const { result } = renderHook(() => useLocalModelSelectionNotice());
  act(() => result.current("personality", { source: "local", modelId: "qwen" }));
  await waitFor(() =>
    expect(mock.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Could not check the model download", type: "error" }),
    ),
  );
});
