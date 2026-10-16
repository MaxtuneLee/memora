// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { useWebMcpTools } from "@/hooks/chat/useWebMcpTools";
import type { registerWebMcpTools } from "@/lib/webmcp/tools";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, boolean>,
  initialize: vi.fn(),
  stop: vi.fn(),
  register: vi.fn<typeof registerWebMcpTools>(async () => {}),
  navigate: vi.fn(),
}));
vi.mock("react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("@mcp-b/global", () => ({
  initializeWebModelContext: state.initialize,
  cleanupWebModelContext: state.stop,
}));
vi.mock("@/lib/webmcp/tools", () => ({ registerWebMcpTools: state.register }));
vi.mock("@/livestore/store", () => {
  const store = { useQuery: () => state.settings };
  return { useAppStore: () => store };
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "modelContext");
});

test("loads only when enabled, cleans up on permission changes, and tolerates StrictMode", async () => {
  Object.defineProperty(document, "modelContext", { value: {}, configurable: true });
  const { rerender, unmount } = renderHook(useWebMcpTools, { wrapper: StrictMode });
  expect(state.initialize).not.toHaveBeenCalled();

  state.settings = { webMcpEnabled: true };
  rerender();
  await waitFor(() => expect(state.register).toHaveBeenCalledTimes(1));
  expect(window.__webModelContextOptions?.autoInitialize).toBe(false);
  expect(state.initialize).toHaveBeenCalledWith({
    transport: { tabServer: { allowedOrigins: [window.location.origin] }, iframeServer: false },
  });
  const firstSignal = state.register.mock.calls[0]?.[3] as AbortSignal | undefined;
  expect(firstSignal?.aborted).toBe(false);

  state.settings = { webMcpEnabled: true, webMcpWriteEnabled: true };
  rerender();
  await waitFor(() => expect(state.register).toHaveBeenCalledTimes(2));
  expect(firstSignal?.aborted).toBe(true);
  expect(state.stop).toHaveBeenCalledTimes(1);

  state.settings = { webMcpEnabled: false };
  rerender();
  expect(state.stop).toHaveBeenCalledTimes(2);
  unmount();
  expect(state.stop).toHaveBeenCalledTimes(2);
});
