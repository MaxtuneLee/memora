import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { runHomeGridViewTransition } from "@/components/dashboard/homeGrid/homeGridViewTransition";

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home Grid view transitions", () => {
  it("defers persistence until the old snapshot no longer contains the named preview", () => {
    const name = "home-grid-tile-instance-1";
    const source = document.createElement("div");
    const persistedTarget = document.createElement("div");
    document.body.append(source, persistedTarget);
    let transitionUpdate: (() => void) | undefined;

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: vi.fn((callback: () => void) => {
        transitionUpdate = callback;
        return {};
      }),
    });

    runHomeGridViewTransition({
      update: vi.fn(),
      afterUpdate: () => {
        persistedTarget.style.viewTransitionName = name;
      },
      reducedMotion: false,
      sharedElement: { element: source, name },
    });

    const namedBeforeOldSnapshot = [source, persistedTarget].filter(
      (element) => element.style.viewTransitionName === name,
    );
    if (namedBeforeOldSnapshot.length !== 1 || namedBeforeOldSnapshot[0] !== source) {
      throw new Error(
        `Expected only the drawer preview before the old snapshot; found ${namedBeforeOldSnapshot.length} named elements.`,
      );
    }

    transitionUpdate?.();

    expect(source.style.viewTransitionName).toBe("");
    expect(persistedTarget.style.viewTransitionName).toBe(name);
  });

  it("keeps the shared name through the old snapshot and releases it before the update", () => {
    const source = document.createElement("div");
    let transitionUpdate: (() => void) | undefined;
    const update = vi.fn(() => {
      expect(source.style.viewTransitionName).toBe("");
    });

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: vi.fn((callback: () => void) => {
        transitionUpdate = callback;
        return {};
      }),
    });

    runHomeGridViewTransition({
      update,
      reducedMotion: false,
      sharedElement: { element: source, name: "home-grid-tile-instance-1" },
    });

    expect(source.style.viewTransitionName).toBe("home-grid-tile-instance-1");
    expect(update).not.toHaveBeenCalled();

    transitionUpdate?.();

    expect(update).toHaveBeenCalledOnce();
  });

  it("updates immediately without naming the source when reduced motion is requested", () => {
    const source = document.createElement("div");
    const update = vi.fn();
    const afterUpdate = vi.fn();

    runHomeGridViewTransition({
      update,
      afterUpdate,
      reducedMotion: true,
      sharedElement: { element: source, name: "home-grid-tile-instance-1" },
    });

    expect(update).toHaveBeenCalledOnce();
    expect(afterUpdate).toHaveBeenCalledOnce();
    expect(source.style.viewTransitionName).toBe("");
  });
});
