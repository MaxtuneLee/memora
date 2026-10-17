// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import type { registerWebMcpTools } from "@/lib/webmcp/tools";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, boolean>,
  initialize: vi.fn(),
  stop: vi.fn(),
  register: vi.fn<typeof registerWebMcpTools>(async () => {}),
  startRelay: vi.fn(),
  stopRelay: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("@mcp-b/global", () => ({
  initializeWebModelContext: state.initialize,
  cleanupWebModelContext: state.stop,
}));
vi.mock("@/lib/webmcp/tools", () => ({ registerWebMcpTools: state.register }));
vi.mock("@/lib/webmcp/relay", () => ({ startWebMcpRelay: state.startRelay }));
vi.mock("@/livestore/store", () => {
  const store = { useQuery: () => state.settings };
  return { useAppStore: () => store };
});
beforeEach(() => {
  vi.clearAllMocks();
  state.settings = {};
  state.register.mockResolvedValue();
  state.startRelay.mockReturnValue(state.stopRelay);
  Object.defineProperty(document, "modelContext", { value: {}, configurable: true });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "modelContext");
});

test("loads only when enabled, cleans up on permission changes, and tolerates StrictMode", async () => {
  const { useWebMcpTools } = await import("@/hooks/chat/useWebMcpTools");
  const { rerender, unmount } = renderHook(useWebMcpTools, { wrapper: StrictMode });
  expect(state.initialize).not.toHaveBeenCalled();
  expect(state.startRelay).not.toHaveBeenCalled();

  state.settings = { webMcpEnabled: true };
  rerender();
  await waitFor(() => expect(state.register).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(state.startRelay).toHaveBeenCalledTimes(1));
  expect(window.__webModelContextOptions?.autoInitialize).toBe(false);
  expect(state.initialize).toHaveBeenCalledWith({
    transport: { tabServer: { allowedOrigins: [window.location.origin] }, iframeServer: false },
  });
  const firstSignal = state.register.mock.calls[0]?.[3] as AbortSignal | undefined;
  expect(firstSignal?.aborted).toBe(false);

  state.settings = { webMcpEnabled: true, webMcpWriteEnabled: true };
  rerender();
  await waitFor(() => expect(state.register).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(state.startRelay).toHaveBeenCalledTimes(2));
  expect(firstSignal?.aborted).toBe(true);
  expect(state.stop).toHaveBeenCalledTimes(1);
  expect(state.stopRelay).toHaveBeenCalledTimes(1);

  state.settings = { webMcpEnabled: false };
  rerender();
  expect(state.stop).toHaveBeenCalledTimes(2);
  expect(state.stopRelay).toHaveBeenCalledTimes(2);
  unmount();
  expect(state.stop).toHaveBeenCalledTimes(2);

  let finish!: () => void;
  state.register.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  state.settings = { webMcpEnabled: true };
  const pending = renderHook(useWebMcpTools);
  await waitFor(() => expect(state.register).toHaveBeenCalledTimes(3));
  expect(state.startRelay).toHaveBeenCalledTimes(2);
  state.settings = { webMcpEnabled: false };
  pending.rerender();
  finish();
  await vi.waitFor(() => expect(state.stop).toHaveBeenCalledTimes(3));
  expect(state.startRelay).toHaveBeenCalledTimes(2);
  pending.unmount();

  state.settings = { webMcpEnabled: true };
  const permissions = renderHook(useWebMcpTools);
  await waitFor(() => expect(state.startRelay).toHaveBeenCalledTimes(3));
  state.settings = { webMcpEnabled: true, webMcpReadEnabled: false, webMcpWriteEnabled: false };
  permissions.rerender();
  expect(state.stopRelay).toHaveBeenCalledTimes(3);
  expect(state.stop).toHaveBeenCalledTimes(4);
  permissions.unmount();
});
