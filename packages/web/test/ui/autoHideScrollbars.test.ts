// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  SCROLL_HOVER_ATTRIBUTE,
  SCROLLING_ATTRIBUTE,
  startAutoHideScrollbars,
} from "@/lib/ui/autoHideScrollbars";

let stop: (() => void) | undefined;
let first: HTMLDivElement;
let second: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  first = document.createElement("div");
  second = document.createElement("div");
  document.body.append(first, second);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  first.remove();
  second.remove();
  document.documentElement.removeAttribute(SCROLLING_ATTRIBUTE);
  document.documentElement.style.overflowY = "";
  vi.useRealTimers();
});

// Scroll events do not bubble, so this only reaches the listener via the capture phase.
const scroll = (target: EventTarget) => target.dispatchEvent(new Event("scroll"));

const isScrolling = (element: Element) => element.hasAttribute(SCROLLING_ATTRIBUTE);

const isHovered = (element: Element) => element.hasAttribute(SCROLL_HOVER_ATTRIBUTE);

const pointerOver = (target: EventTarget) =>
  target.dispatchEvent(new Event("pointerover", { bubbles: true }));

/** jsdom reports every box as 0x0, so overflow has to be faked for canScroll to see it. */
const makeScrollable = (element: HTMLElement) => {
  element.style.overflowY = "auto";
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: 500 });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: 100 });
};

test("shows a scrollbar while its container scrolls and hides it once that container stops", () => {
  stop = startAutoHideScrollbars({ idleDelayMs: 1000 });

  expect(isScrolling(first)).toBe(false);

  scroll(first);
  expect(isScrolling(first)).toBe(true);

  vi.advanceTimersByTime(999);
  expect(isScrolling(first)).toBe(true);

  vi.advanceTimersByTime(1);
  expect(isScrolling(first)).toBe(false);
});

test("fades each container's scrollbar on its own timeline", () => {
  stop = startAutoHideScrollbars({ idleDelayMs: 1000 });

  scroll(first);
  vi.advanceTimersByTime(600);
  scroll(second);

  // Only the pane that scrolled is lit, and the earlier one is still counting down.
  expect(isScrolling(first)).toBe(true);
  expect(isScrolling(second)).toBe(true);

  vi.advanceTimersByTime(400);
  expect(isScrolling(first)).toBe(false);
  expect(isScrolling(second)).toBe(true);

  vi.advanceTimersByTime(600);
  expect(isScrolling(second)).toBe(false);
});

test("keeps a scrollbar visible through a continuous scroll", () => {
  stop = startAutoHideScrollbars({ idleDelayMs: 1000 });

  scroll(first);
  // Each further scroll has to restart that container's countdown, otherwise the scrollbar
  // blinks out mid-gesture on any scroll lasting longer than the delay.
  for (let elapsed = 0; elapsed < 3000; elapsed += 500) {
    vi.advanceTimersByTime(500);
    scroll(first);
  }

  expect(isScrolling(first)).toBe(true);
});

test("flags the page's own scrollbar on the document element", () => {
  stop = startAutoHideScrollbars({ idleDelayMs: 1000 });

  scroll(document);
  expect(isScrolling(document.documentElement)).toBe(true);

  vi.advanceTimersByTime(1000);
  expect(isScrolling(document.documentElement)).toBe(false);
});

test("clears every flag it set on teardown", () => {
  stop = startAutoHideScrollbars({ idleDelayMs: 1000 });

  scroll(first);
  scroll(second);
  stop();
  stop = undefined;

  expect(isScrolling(first)).toBe(false);
  expect(isScrolling(second)).toBe(false);

  scroll(first);
  expect(isScrolling(first)).toBe(false);
});

test("reveals a scrollbar while the pointer is over its container", () => {
  makeScrollable(first);
  stop = startAutoHideScrollbars({ idleDelayMs: 1000 });

  const child = document.createElement("span");
  first.append(child);

  // Entering a child still counts as being over the container that owns the scrollbar.
  pointerOver(child);
  expect(isHovered(first)).toBe(true);
  expect(isHovered(second)).toBe(false);

  // No countdown applies to hover: the scrollbar stays until the pointer actually leaves.
  vi.advanceTimersByTime(5000);
  expect(isHovered(first)).toBe(true);

  pointerOver(second);
  expect(isHovered(first)).toBe(false);
  expect(isHovered(second)).toBe(false);
});

test("leaves the page's own scrollbar to scrolling alone", () => {
  makeScrollable(document.documentElement);
  stop = startAutoHideScrollbars({ idleDelayMs: 1000 });

  // The document is an ancestor of everything, so revealing it on hover would mean the most
  // prominent scrollbar on screen never hides while the mouse is in the window.
  pointerOver(second);
  expect(isHovered(document.documentElement)).toBe(false);
  expect(isHovered(document.body)).toBe(false);
});

test("clears the hover flag on teardown", () => {
  makeScrollable(first);
  stop = startAutoHideScrollbars({ idleDelayMs: 1000 });

  pointerOver(first);
  expect(isHovered(first)).toBe(true);

  stop();
  stop = undefined;
  expect(isHovered(first)).toBe(false);
});
