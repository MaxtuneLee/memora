import type { JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { GeneratedWidgetFrame } from "@/components/dashboard/homeGrid/GeneratedWidgetFrame";
import {
  GENERATED_WIDGET_DATA_MESSAGE,
  GENERATED_WIDGET_THEME_MESSAGE,
} from "@/lib/widgets/generatedWidgetRuntime";

import { expectScreenshot, loadAppFonts } from "./visual";

const PROBE_MESSAGE_TYPE = "memora-test:theme-probe";

interface ThemeReport {
  runId: number;
  clicks: number;
  theme: string | undefined;
  colorScheme: string;
  textColor: string;
  renderedValue: string;
  canReadStorage: boolean;
  selfThemeChecked: boolean;
}

// The sandboxed frame can't be inspected from outside (see generatedWidgetSandbox), so the widget
// reports its computed theme over postMessage whenever its root theme or data changes. runId is
// fixed per script run and clicks is widget-held state: both staying put proves the host changed
// the theme in place instead of reloading the frame.
const WIDGET_CODE = `<div data-testid="value">waiting</div><script>
var runId = Math.random();
var clicks = 0;
var lastValue = "none";
var selfThemeChecked = false;
var report = function () {
  var canReadStorage = true;
  try { void window.localStorage; } catch (error) { canReadStorage = false; }
  window.parent.postMessage({
    type: "${PROBE_MESSAGE_TYPE}",
    runId: runId,
    clicks: clicks,
    theme: document.documentElement.dataset.theme,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    textColor: getComputedStyle(document.body).color,
    renderedValue: lastValue,
    canReadStorage: canReadStorage,
    selfThemeChecked: selfThemeChecked,
  }, "*");
};
window.addEventListener("message", function (event) {
  if (event.data === "memora-test:click") { clicks += 1; report(); }
  if (event.data === "memora-test:self-theme") {
    window.postMessage({ type: "${GENERATED_WIDGET_THEME_MESSAGE}", theme: "dark" }, "*");
    window.setTimeout(function () { selfThemeChecked = true; report(); }, 50);
  }
});
new MutationObserver(report).observe(document.documentElement, { attributes: true });
onData(function (data) { lastValue = "value:" + data; report(); });
</script>`;

const DARK_TEXT = "rgb(236, 232, 223)";
const LIGHT_TEXT = "rgb(29, 28, 26)";

function ThemeHarness({ value }: { value: number }): JSX.Element {
  return <GeneratedWidgetFrame widgetCode={WIDGET_CODE} data={value} title="Theme test widget" />;
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;
const reports: ThemeReport[] = [];
const collectReport = (event: MessageEvent) => {
  if (event.data?.type === PROBE_MESSAGE_TYPE) {
    reports.push(event.data);
  }
};

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
  reports.length = 0;
  window.removeEventListener("message", collectReport);
  delete document.documentElement.dataset.theme;
});

describe("Generated Home Grid widget theme", () => {
  it("starts in the resolved theme and follows live changes without reloading", async () => {
    document.documentElement.dataset.theme = "dark";
    window.addEventListener("message", collectReport);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<ThemeHarness value={1} />);

    await expect.poll(() => reports.at(-1)?.renderedValue, { timeout: 5000 }).toBe("value:1");
    expect(reports.at(-1)).toMatchObject({
      theme: "dark",
      colorScheme: "dark",
      textColor: DARK_TEXT,
      canReadStorage: false,
    });
    const iframe = container.querySelector("iframe");
    const iframeWindow = iframe?.contentWindow;
    if (!iframe || !iframeWindow) {
      throw new Error("Expected the generated widget to render an iframe.");
    }
    const { runId } = reports.at(-1) as ThemeReport;
    iframeWindow.postMessage("memora-test:click", "*");
    await expect.poll(() => reports.at(-1)?.clicks, { timeout: 5000 }).toBe(1);

    document.documentElement.dataset.theme = "light";

    await expect.poll(() => reports.at(-1)?.theme, { timeout: 5000 }).toBe("light");
    expect(reports.at(-1)).toMatchObject({
      runId,
      clicks: 1,
      colorScheme: "light",
      textColor: LIGHT_TEXT,
      renderedValue: "value:1",
    });
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
  });

  it("ignores malformed and non-host theme messages and keeps the data channel working", async () => {
    document.documentElement.dataset.theme = "light";
    window.addEventListener("message", collectReport);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<ThemeHarness value={1} />);

    await expect.poll(() => reports.at(-1)?.renderedValue, { timeout: 5000 }).toBe("value:1");
    const iframeWindow = container.querySelector("iframe")?.contentWindow;
    if (!iframeWindow) {
      throw new Error("Expected the generated widget to render an iframe.");
    }
    const { runId } = reports.at(-1) as ThemeReport;

    iframeWindow.postMessage({ type: GENERATED_WIDGET_THEME_MESSAGE, theme: "purple" }, "*");
    iframeWindow.postMessage({ type: GENERATED_WIDGET_THEME_MESSAGE }, "*");
    iframeWindow.postMessage(
      { type: GENERATED_WIDGET_THEME_MESSAGE, theme: "light", payload: 99 },
      "*",
    );
    iframeWindow.postMessage(
      { type: GENERATED_WIDGET_DATA_MESSAGE.toUpperCase(), payload: 7 },
      "*",
    );
    // The widget posts a well-formed dark update to itself: it must be dropped because only the
    // host (window.parent) may change the theme.
    iframeWindow.postMessage("memora-test:self-theme", "*");
    await expect.poll(() => reports.at(-1)?.selfThemeChecked, { timeout: 5000 }).toBe(true);

    expect(reports.every((report) => report.theme === "light")).toBe(true);
    expect(reports.at(-1)).toMatchObject({
      runId,
      renderedValue: "value:1",
      textColor: LIGHT_TEXT,
    });

    root.render(<ThemeHarness value={2} />);
    await expect.poll(() => reports.at(-1)?.renderedValue, { timeout: 5000 }).toBe("value:2");
    expect(reports.at(-1)?.runId).toBe(runId);
  });
});

// Static content: no random or time-based output, so the capture is deterministic.
const REFERENCE_WIDGET_CODE = `<div style="display:flex;flex-direction:column;gap:12px;padding:16px">
<h3 style="margin:0">Weekly focus</h3>
<p id="value" style="margin:0;color:var(--color-text-secondary)">waiting</p>
<label style="display:flex;gap:8px;align-items:center">Progress <input type="range" value="60" /></label>
<div style="display:flex;gap:8px"><button>Refresh</button><button disabled>Archive</button></div>
</div><script>
onData(function (data) { document.getElementById("value").textContent = data; });
// The frame loads its own web fonts; report once they are ready so the capture is stable.
var waitForFonts = function () {
  var registered = Array.from(document.fonts).some(function (face) { return face.family.indexOf("Noto Sans") !== -1; });
  if (!registered) return setTimeout(waitForFonts, 50);
  document.fonts.load("400 1em \\"Noto Sans\\"").then(function () { return document.fonts.ready; }).then(function () {
    window.parent.postMessage({ type: "memora-test:fonts-ready" }, "*");
  });
};
waitForFonts();
</script>`;

describe.each(["light", "dark"] as const)("Generated Home Grid widget reference in %s", (theme) => {
  it("matches the reference once its data arrives", async () => {
    document.documentElement.dataset.theme = theme;
    let fontsReady = false;
    const onFontsReady = (event: MessageEvent) => {
      if (event.data?.type === "memora-test:fonts-ready") fontsReady = true;
    };
    window.addEventListener("message", onFontsReady);
    container = document.createElement("div");
    container.style.width = "360px";
    container.style.height = "220px";
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <GeneratedWidgetFrame
        widgetCode={REFERENCE_WIDGET_CODE}
        data="Three recordings to review"
        title="Reference widget"
      />,
    );

    await expect
      .poll(() => container?.querySelector("[role='status']") ?? null, { timeout: 10_000 })
      .toBeNull();
    await expect.poll(() => fontsReady, { timeout: 10_000 }).toBe(true);
    window.removeEventListener("message", onFontsReady);
    await loadAppFonts();
    await expectScreenshot(container, `widget-${theme}`);
  });
});
