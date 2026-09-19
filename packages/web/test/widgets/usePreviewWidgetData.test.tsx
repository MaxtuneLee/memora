import { act, cleanup, renderHook } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { usePreviewWidgetData } from "@/hooks/widgets/usePreviewWidgetData";
import { WIDGET_DATA_MAX_FILE_BYTES } from "@/lib/widgets/widgetDataFile";

const setupDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("Blob", dom.window.Blob);
};

beforeEach(() => {
  setupDom();
  cleanup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a declared write lands in value, JSON-parsed", async () => {
  const { result } = renderHook(() => usePreviewWidgetData(["state.json"]));

  await act(async () => {
    const write = await result.current.write("state.json", JSON.stringify({ streak: 2 }));
    expect(write).toEqual({ ok: true });
  });

  expect(result.current.value).toEqual({ "state.json": { streak: 2 } });
});

test("an undeclared write is refused and never appears in value", async () => {
  const { result } = renderHook(() => usePreviewWidgetData(["state.json"]));

  await act(async () => {
    const write = await result.current.write("other.json", "{}");
    expect(write.ok).toBe(false);
  });

  expect(result.current.value).toEqual({});
});

test("with no declaration at all, every write is refused", async () => {
  const { result } = renderHook(() => usePreviewWidgetData(undefined));

  await act(async () => {
    const write = await result.current.write("state.json", "{}");
    expect(write.ok).toBe(false);
  });
});

test("non-JSON content is kept as a raw string", async () => {
  const { result } = renderHook(() => usePreviewWidgetData(["notes.txt"]));

  await act(async () => {
    await result.current.write("notes.txt", "just text");
  });

  expect(result.current.value).toEqual({ "notes.txt": "just text" });
});

test("a write over the per-file byte limit is refused", async () => {
  const { result } = renderHook(() => usePreviewWidgetData(["state.json"]));

  await act(async () => {
    const write = await result.current.write(
      "state.json",
      "x".repeat(WIDGET_DATA_MAX_FILE_BYTES + 1),
    );
    expect(write.ok).toBe(false);
  });

  expect(result.current.value).toEqual({});
});
