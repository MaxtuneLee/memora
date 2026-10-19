import { createLessonQuiz, type LessonQuizOptions } from "@/lib/chat/lessonQuiz";
import { getAllowedCdnScriptHref } from "@/lib/widgets/sandbox/cdnAllowlist";
import { toWidgetText } from "@/lib/widgets/sandbox/limits";
import {
  HOST_MESSAGE,
  RUNNER_MESSAGE,
  parseHostMessage,
  type HostMessage,
  type RunnerMessage,
  type WidgetErrorKind,
  type WidgetScriptSpec,
} from "@/lib/widgets/sandbox/protocol";
import { createWriteQueue } from "@/lib/widgets/sandbox/writeQueue";

// The widget runner page (ADR 0011). It is a static page with no knowledge of any one widget: the
// host posts the generated style, markup and scripts, and this file renders and runs them. When a
// sandbox origin is configured the page is served from another site, so the browser can give it
// its own process and a widget that never returns cannot freeze the app.
//
// The browser tests in test/browser/widgetSandbox*.browser.test.tsx and generatedWidget*.browser
// .test.tsx drive this page through a real iframe.

const container = document.getElementById("widget-root") as HTMLDivElement;
const hostWindow = window.parent;

const post = (message: RunnerMessage): void => {
  // fallow-ignore-next-line security-sink -- The runner's origin is opaque and the host's origin is not known to it; messages are what the widget itself chose to send.
  hostWindow.postMessage(message, "*");
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500) || "Widget script failed to execute.";
};

let currentSignature: string | null = null;
const reportError = (error: unknown, kind: WidgetErrorKind): void => {
  post({
    type: RUNNER_MESSAGE.error,
    kind,
    signature: currentSignature,
    message: errorMessage(error),
  });
};

// --- Size reporting -------------------------------------------------------------------------

let lastHeight = -1;
let lastHasContent: boolean | null = null;
let measureTimer: number | null = null;

// Not documentElement.scrollHeight: it never drops below the frame's own viewport, so the frame
// could grow with its content but never shrink back.
const readHeight = (): number =>
  Math.max(
    1,
    container.scrollHeight,
    container.offsetHeight,
    document.body.scrollHeight,
    document.body.offsetHeight,
  );

const readHasContent = (): boolean =>
  container.childElementCount > 0 || (container.textContent?.trim().length ?? 0) > 0;

const measure = (): void => {
  measureTimer = null;
  const height = readHeight();
  const hasContent = readHasContent();
  if (height === lastHeight && hasContent === lastHasContent) {
    return;
  }
  lastHeight = height;
  lastHasContent = hasContent;
  post({ type: RUNNER_MESSAGE.resize, height, hasContent });
};

// A timer, not requestAnimationFrame: the host hides the frame (display: none) until the widget
// has content, and animation frames do not run in a hidden frame.
const scheduleMeasure = (): void => {
  if (measureTimer === null) {
    measureTimer = window.setTimeout(measure, 16);
  }
};

new ResizeObserver(scheduleMeasure).observe(document.body);
new ResizeObserver(scheduleMeasure).observe(container);
new MutationObserver(scheduleMeasure).observe(container, {
  childList: true,
  subtree: true,
  characterData: true,
});

// --- Data and actions the widget can reach ---------------------------------------------------

let latestData: unknown = null;
let hasData = false;
let dataListeners: Array<(data: unknown) => void> = [];

const callListener = (listener: (data: unknown) => void): void => {
  try {
    listener(latestData);
  } catch (error) {
    reportError(error, "listener");
    console.error("Generated widget data listener failed:", error);
  }
};

const sendPrompt = (text: unknown): Promise<void> => {
  post({ type: RUNNER_MESSAGE.sendPrompt, text: toWidgetText(text) });
  return Promise.resolve();
};

const openLink = (url: unknown): void => {
  post({ type: RUNNER_MESSAGE.openLink, url: toWidgetText(url) });
};

const writeQueue = createWriteQueue((request) => {
  post({ type: RUNNER_MESSAGE.writeData, ...request });
});

const writeData = (name: unknown, content: unknown): Promise<undefined> =>
  writeQueue.write(toWidgetText(name), toWidgetText(content));

interface WidgetBridge {
  container: HTMLDivElement;
  Chart: unknown;
  sendPrompt: typeof sendPrompt;
  openLink: typeof openLink;
  getData: () => unknown;
  onData: (callback: (data: unknown) => void) => void;
  writeData: typeof writeData;
  lesson: { quiz: (mount: HTMLElement, options: LessonQuizOptions) => unknown };
  registerCleanup: (cleanup: unknown) => void;
  fail: (error: unknown) => void;
}

const BRIDGE_KEY = "__MEMORA_WIDGET_BRIDGE__";
const HOME_WIDGET_KEY = "MEMORA_HOME_WIDGET";
const SCRIPT_ATTR = "data-widget-runtime-script";

interface WidgetWindow extends Window {
  [BRIDGE_KEY]?: WidgetBridge;
  [HOME_WIDGET_KEY]?: Partial<WidgetBridge>;
  Chart?: unknown;
}

const widgetWindow = window as WidgetWindow;

// --- Rendering and running a widget ----------------------------------------------------------

let cleanups: Array<() => void> = [];
let scriptElements: HTMLScriptElement[] = [];
let runId = 0;
let lastHtml: string | null = null;
let lastStyle: string | null = null;

const userStyle = document.createElement("style");
userStyle.setAttribute("data-widget-user-style", "");
document.head.append(userStyle);

const setMarkup = (html: string): void => {
  // fallow-ignore-next-line security-sink -- Generated widget markup is meant to run here: this page is the sandbox, with a CSP and no access to the app (ADR 0011).
  container.innerHTML = html;
  lastHtml = html;
};

const render = (style: string, html: string): void => {
  if (style !== lastStyle) {
    userStyle.textContent = style;
    lastStyle = style;
  }
  // Skipped when unchanged so a stream chunk that only extends the script does not wipe the DOM a
  // running script has already built.
  if (html !== lastHtml) {
    setMarkup(html);
  }
  scheduleMeasure();
};

const runCleanup = (cleanup: () => void): void => {
  try {
    cleanup();
  } catch (error) {
    console.error("Widget cleanup failed:", error);
  }
};

const teardown = (): void => {
  runId += 1;
  const pending = cleanups;
  cleanups = [];
  pending.forEach(runCleanup);
  scriptElements.forEach((element) => element.remove());
  scriptElements = [];
  // Subscribers belong to the script that registered them; the last value survives so a re-run
  // script's onData callback still fires immediately.
  dataListeners = [];
  delete widgetWindow[BRIDGE_KEY];
  delete widgetWindow[HOME_WIDGET_KEY];
};

const loadExternalScript = (src: string): Promise<void> => {
  const href = getAllowedCdnScriptHref(src);
  if (!href) {
    return Promise.reject(new Error("A script was blocked because its host is not allowed."));
  }
  return new Promise((resolve, reject) => {
    const element = document.createElement("script");
    element.src = href;
    element.setAttribute(SCRIPT_ATTR, "");
    element.addEventListener("load", () => resolve(), { once: true });
    element.addEventListener("error", () => reject(new Error(`Failed to load ${href}.`)), {
      once: true,
    });
    scriptElements.push(element);
    document.body.append(element);
  });
};

const usesChart = (script: WidgetScriptSpec): boolean =>
  "content" in script && /\bChart\b/.test(script.content);

// Chat widgets use `Chart` without loading it. Chart.js is bundled into the runner and only
// fetched when a script mentions it and no CDN script has already defined it.
const ensureChart = async (scripts: WidgetScriptSpec[]): Promise<void> => {
  if (widgetWindow.Chart || !scripts.some(usesChart)) {
    return;
  }
  const module = await import("chart.js/auto");
  widgetWindow.Chart = module.default;
};

const wrapInlineScript = (content: string): string => `"use strict";
(() => {
  const bridge = window.${BRIDGE_KEY};
  const container = bridge.container;
  const root = container;
  const shadowRoot = document;
  const Chart = window.Chart ?? bridge.Chart;
  const { sendPrompt, openLink, getData, onData, writeData, lesson } = bridge;
  try {
    const cleanup = (() => {
${content}
    })();
    bridge.registerCleanup(cleanup);
  } catch (error) {
    bridge.fail(error);
  }
})();`;

const runInlineScript = (content: string, bridge: WidgetBridge): void => {
  const element = document.createElement("script");
  element.setAttribute(SCRIPT_ATTR, "");
  element.textContent = wrapInlineScript(content);

  // A syntax error never reaches the wrapper's catch; it only fires window's error event, and
  // only while the script is being evaluated.
  const handleSyntaxError = (event: ErrorEvent) => {
    event.preventDefault();
    bridge.fail(event.error ?? new Error(event.message));
  };
  window.addEventListener("error", handleSyntaxError);
  try {
    scriptElements.push(element);
    document.body.append(element);
  } finally {
    window.removeEventListener("error", handleSyntaxError);
  }
};

interface RunOutcome {
  failure: unknown;
  cleanup: (() => void) | null;
}

const createBridge = (outcome: RunOutcome): WidgetBridge => ({
  container,
  Chart: undefined,
  sendPrompt,
  openLink,
  getData: () => latestData,
  onData: (callback) => {
    dataListeners.push(callback);
    if (hasData) {
      callListener(callback);
    }
  },
  writeData,
  lesson: {
    quiz: (mount, options) => createLessonQuiz(mount, options, sendPrompt),
  },
  registerCleanup: (value) => {
    if (typeof value === "function") {
      outcome.cleanup = value as () => void;
    }
  },
  fail: (error) => {
    outcome.failure ??= error;
  },
});

const runScript = async (script: WidgetScriptSpec, bridge: WidgetBridge): Promise<void> => {
  if ("src" in script) {
    await loadExternalScript(script.src);
  } else {
    runInlineScript(script.content, bridge);
  }
};

// Runs the scripts in order and stops at the first failure or when a newer run has started.
const runScripts = async (
  scripts: WidgetScriptSpec[],
  bridge: WidgetBridge,
  outcome: RunOutcome,
  thisRun: number,
): Promise<void> => {
  try {
    await ensureChart(scripts);
    for (const script of scripts) {
      if (thisRun !== runId || outcome.failure) {
        return;
      }
      await runScript(script, bridge);
    }
  } catch (error) {
    outcome.failure ??= error;
  }
};

const finishRun = (signature: string, scriptCount: number, outcome: RunOutcome): void => {
  if (outcome.cleanup) {
    cleanups.push(outcome.cleanup);
  }
  if (outcome.failure) {
    reportError(outcome.failure, "script");
    console.error("Generated widget script failed:", outcome.failure);
    return;
  }
  post({
    type: RUNNER_MESSAGE.runResult,
    signature,
    scriptCount,
    hasCleanup: outcome.cleanup !== null,
  });
  post({ type: RUNNER_MESSAGE.ready });
  scheduleMeasure();
};

const run = async (signature: string, scripts: WidgetScriptSpec[]): Promise<void> => {
  teardown();
  const thisRun = runId;
  currentSignature = signature;
  // Every run starts from the widget's own markup, so a script that appends builds once instead
  // of stacking on the last run.
  if (lastHtml !== null) {
    setMarkup(lastHtml);
  }

  const outcome: RunOutcome = { failure: null, cleanup: null };
  const bridge = createBridge(outcome);
  widgetWindow[BRIDGE_KEY] = bridge;
  // Home Grid widgets reach the same surface through this name as well as bare identifiers.
  widgetWindow[HOME_WIDGET_KEY] = bridge;

  await runScripts(scripts, bridge, outcome, thisRun);
  if (thisRun === runId) {
    finishRun(signature, scripts.length, outcome);
  }
};

// --- Messages from the host ------------------------------------------------------------------

type HostHandlers = {
  [Type in HostMessage["type"]]: (message: Extract<HostMessage, { type: Type }>) => void;
};

const setTheme = (theme: string): void => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

const hostHandlers: HostHandlers = {
  [HOST_MESSAGE.ping]: (message) => post({ type: RUNNER_MESSAGE.pong, seq: message.seq }),
  [HOST_MESSAGE.render]: (message) => render(message.style, message.html),
  [HOST_MESSAGE.run]: (message) => void run(message.signature, message.scripts),
  [HOST_MESSAGE.teardown]: () => teardown(),
  [HOST_MESSAGE.data]: (message) => {
    latestData = message.payload;
    hasData = true;
    dataListeners.forEach(callListener);
    scheduleMeasure();
  },
  [HOST_MESSAGE.theme]: (message) => setTheme(message.theme),
  [HOST_MESSAGE.writeDataResult]: (message) =>
    writeQueue.settle(message.requestId, message.ok, message.error),
};

let hostSpoke = false;

const dispatchHostMessage = <Type extends HostMessage["type"]>(
  message: Extract<HostMessage, { type: Type }>,
): void => {
  hostHandlers[message.type as Type](message);
};

window.addEventListener("message", (event: MessageEvent) => {
  const message = event.source === hostWindow ? parseHostMessage(event.data) : null;
  if (message) {
    hostSpoke = true;
    dispatchHostMessage(message);
  }
});

// The host may not be listening yet when this page loads, so announce until it answers.
let bootAttempts = 0;
const announceBoot = (): void => {
  if (hostSpoke || bootAttempts >= 60) {
    return;
  }
  bootAttempts += 1;
  post({ type: RUNNER_MESSAGE.boot });
  window.setTimeout(announceBoot, 250);
};
announceBoot();
