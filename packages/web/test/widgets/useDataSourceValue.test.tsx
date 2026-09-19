import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { useDataSourceValue } from "@/hooks/widgets/useDataSourceValue";
import type { ReactiveWidgetStore } from "@/lib/widgets/widgetStore";

const testState = vi.hoisted(() => {
  const listChatSessions = vi.fn();
  return { listChatSessions };
});

vi.mock("@/lib/chat/chatSessionStorage", () => ({ listChatSessions: testState.listChatSessions }));

const setupDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
};

beforeEach(() => {
  setupDom();
  cleanup();
  testState.listChatSessions.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// A real reactive store returns the same array reference until the underlying data changes; a
// fresh literal on every call would make the hook's `liveSignal` dependency change on every
// render and loop forever, so this stub matches the stable-reference contract.
const EMPTY_ROWS: readonly unknown[] = [];

const makeStore = (): ReactiveWidgetStore => {
  const resolve = (_query: unknown) => EMPTY_ROWS;
  return {
    useQuery: vi.fn(resolve),
    query: vi.fn(resolve),
  } as unknown as ReactiveWidgetStore;
};

test("returns null and never resolves when there is no bound data source", () => {
  const store = makeStore();

  const { result } = renderHook(() => useDataSourceValue(store, null, {}));

  expect(result.current).toBeNull();
});

test("reports loading before the first resolution, then the resolved value", async () => {
  testState.listChatSessions.mockResolvedValue([{ id: "s1" }]);
  const store = makeStore();

  const { result } = renderHook(() => useDataSourceValue(store, "chatSessionCount", {}));

  expect(result.current).toEqual({ status: "loading" });

  await waitFor(() => expect(result.current).toEqual({ status: "ready", value: { count: 1 } }));
});

test("never reports a loading flash again after the first resolution for the same source", async () => {
  testState.listChatSessions.mockResolvedValue([]);
  const store = makeStore();

  const { result, rerender } = renderHook(
    ({ params }) => useDataSourceValue(store, "chatSessionCount", params),
    { initialProps: { params: { a: 1 } } },
  );

  await waitFor(() => expect(result.current?.status).toBe("ready"));

  testState.listChatSessions.mockResolvedValue([{ id: "s1" }]);
  rerender({ params: { a: 2 } });

  // The state must stay "ready" the whole time — it should never flash back to "loading" on a
  // params-driven refresh, only on the very first resolution of a given data source.
  expect(result.current?.status).toBe("ready");
  await waitFor(() => expect(result.current).toEqual({ status: "ready", value: { count: 1 } }));
});

test("resets to loading when the bound data source name changes", async () => {
  testState.listChatSessions.mockResolvedValue([]);
  const store = makeStore();

  const initialProps: { name: "chatSessionCount" | null } = { name: "chatSessionCount" };
  const { result, rerender } = renderHook(
    ({ name }: { name: "chatSessionCount" | null }) => useDataSourceValue(store, name, {}),
    { initialProps },
  );

  await waitFor(() => expect(result.current?.status).toBe("ready"));

  rerender({ name: null });
  expect(result.current).toBeNull();

  rerender({ name: "chatSessionCount" });
  expect(result.current).toEqual({ status: "loading" });

  await waitFor(() => expect(result.current?.status).toBe("ready"));
});
