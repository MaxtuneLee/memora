import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  consumePendingHomeGridPrompt,
  setPendingHomeGridPrompt,
} from "@/lib/widgets/homeGridPrompt";

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("sessionStorage", dom.window.sessionStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("returns null when nothing is pending", () => {
  expect(consumePendingHomeGridPrompt()).toBeNull();
});

test("round-trips a pending prompt exactly once", () => {
  setPendingHomeGridPrompt("summarize my recent files");

  expect(consumePendingHomeGridPrompt()).toBe("summarize my recent files");
  expect(consumePendingHomeGridPrompt()).toBeNull();
});
