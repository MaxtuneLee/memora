import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeneratedWidgetFrame } from "@/components/dashboard/homeGrid/GeneratedWidgetFrame";

// A widget that never returns used to freeze the whole app, because its frame shared the app's
// process and thread. This test runs the runner from a second site (127.0.0.1, while the app is on
// localhost) so Chromium gives it a process of its own, the way a configured sandbox origin does.
// The watchdog takes about eight seconds to give up on a frame, close to the default limit.
const WATCHDOG_TEST_TIMEOUT_MS = 40_000;

const crossSiteRunnerUrl = (): string =>
  `http://127.0.0.1:${window.location.port}/widget-runner.html`;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  vi.stubEnv("VITE_WIDGET_SANDBOX_URL", crossSiteRunnerUrl());
});

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
  vi.unstubAllEnvs();
});

describe("Widget that never returns", () => {
  it(
    "keeps the app responsive, then replaces the widget with a message and a way to reload it",
    async () => {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);

      let longestGap = 0;
      let lastTick = performance.now();
      const tickId = window.setInterval(() => {
        const now = performance.now();
        longestGap = Math.max(longestGap, now - lastTick);
        lastTick = now;
      }, 50);

      try {
        root.render(
          <GeneratedWidgetFrame
            widgetCode={"<div>Stuck widget</div><script>while (true) {}</script>"}
            data={null}
            title="Stuck widget"
          />,
        );

        await expect.poll(() => Boolean(container?.querySelector("iframe"))).toBe(true);
        const firstFrame = container.querySelector("iframe");
        expect(firstFrame?.getAttribute("src")).toContain("127.0.0.1");

        // The widget script spins from the moment it runs, so it never reports ready and the
        // runner stops answering pings.
        await expect
          .poll(() => container?.querySelector('[role="alert"]')?.textContent, { timeout: 30_000 })
          .toContain("This widget stopped responding.");
        expect(container.querySelector("iframe")).toBeNull();

        // A host that shared the widget's thread could not have run its timer during the hang.
        expect(longestGap).toBeLessThan(1000);

        const reload = container.querySelector("button");
        expect(reload?.textContent).toBe("Reload widget");
        reload?.click();
        await expect.poll(() => Boolean(container?.querySelector("iframe"))).toBe(true);
        expect(container.querySelector("iframe")).not.toBe(firstFrame);
      } finally {
        window.clearInterval(tickId);
      }
    },
    WATCHDOG_TEST_TIMEOUT_MS,
  );

  // Widgets from one runner site share a process, so a stuck widget also stalls the other widgets
  // on the page until the watchdog removes them. The app itself keeps running either way.
  it(
    "keeps the app responsive while several widgets share the page",
    async () => {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);

      let longestGap = 0;
      let lastTick = performance.now();
      const tickId = window.setInterval(() => {
        const now = performance.now();
        longestGap = Math.max(longestGap, now - lastTick);
        lastTick = now;
      }, 50);

      try {
        root.render(
          <div>
            <GeneratedWidgetFrame
              widgetCode={"<div>Stuck widget</div><script>while (true) {}</script>"}
              data={null}
              title="Stuck widget"
            />
            <GeneratedWidgetFrame
              widgetCode="<div>Other widget</div>"
              data={null}
              title="Other widget"
            />
          </div>,
        );

        await expect
          .poll(() => container?.querySelectorAll('[role="alert"]').length, { timeout: 30_000 })
          .toBeGreaterThan(0);
        expect(longestGap).toBeLessThan(1000);
      } finally {
        window.clearInterval(tickId);
      }
    },
    WATCHDOG_TEST_TIMEOUT_MS,
  );
});
