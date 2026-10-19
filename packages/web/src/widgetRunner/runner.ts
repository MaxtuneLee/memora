import { createLessonQuiz, type LessonQuizOptions } from "@/lib/chat/lessonQuiz";
import { getAllowedCdnScriptHref } from "@/lib/widgets/sandbox/cdnAllowlist";
import {
  HOST_MESSAGE,
  RUNNER_MESSAGE,
  parseHostMessage,
  type HostMessage,
  type RunnerMessage,
  type WidgetErrorKind,
  type WidgetScriptSpec,
} from "@/lib/widgets/sandbox/protocol";

// The widget runner page (ADR 0011). It is a static page with no knowledge of any one widget: the
// host posts the generated style, markup and scripts, and this file renders and runs them. When a
// sandbox origin is configured the page is served from another site, so the browser can give it
// its own process and a widget that never returns cannot freeze the app.

const container = document.getElementById("widget-root") as HTMLDivElement;
const hostWindow = window.parent;

const post = (message: RunnerMessage): void => {
  hostWindow.postMessage(message, "*");
};

// What the widget's own String(x) would have produced for the values these calls expect.
const toText = (value: unknown): string =>
  typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
      ? String(value)
      : "";

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
let measureFrame: number | null = null;

const measure = (): void => {
  measureFrame = null;
  const body = document.body;
  // Not documentElement.scrollHeight: it never drops below the frame's own viewport, so the
  // frame could grow with its content but never shrink back.
  const height = Math.max(
    1,
    container.scrollHeight,
    container.offsetHeight,
    body.scrollHeight,
    body.offsetHeight,
  );
  const hasContent =
    container.childElementCount > 0 || (container.textContent?.trim().length ?? 0) > 0;
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
  if (measureFrame === null) {
    measureFrame = window.setTimeout(measure, 16);
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

const notifyListeners = (): void => {
  dataListeners.forEach((listener) => {
    try {
      listener(latestData);
    } catch (error) {
      reportError(error, "listener");
      console.error("Generated widget data listener failed:", error);
    }
  });
};

const sendPrompt = (text: unknown): Promise<void> => {
  post({ type: RUNNER_MESSAGE.sendPrompt, text: toText(text) });
  return Promise.resolve();
};

const openLink = (url: unknown): void => {
  post({ type: RUNNER_MESSAGE.openLink, url: toText(url) });
};

// Writes go one at a time per file name: a call while one is pending replaces the queued content
// (last write wins) instead of piling up requests, per ADR 0008.
interface WriteWaiter {
  resolve: (value: undefined) => void;
  reject: (error: Error) => void;
}
interface WriteState {
  inFlight: boolean;
  next: { content: string; waiter: WriteWaiter } | null;
}

const writeStates = new Map<string, WriteState>();
const pendingWrites = new Map<string, WriteWaiter>();
let writeRequestSeq = 0;

const sendWriteRequest = (name: string, content: string): Promise<undefined> => {
  writeRequestSeq += 1;
  const requestId = String(writeRequestSeq);
  return new Promise((resolve, reject) => {
    pendingWrites.set(requestId, { resolve, reject });
    post({ type: RUNNER_MESSAGE.writeData, requestId, name, content });
  });
};

const flushQueuedWrite = (name: string): void => {
  const state = writeStates.get(name);
  if (!state) {
    return;
  }
  const queued = state.next;
  state.next = null;
  if (!queued) {
    state.inFlight = false;
    return;
  }
  sendWriteRequest(name, queued.content).then(
    (result) => {
      queued.waiter.resolve(result);
      flushQueuedWrite(name);
    },
    (error: Error) => {
      queued.waiter.reject(error);
      flushQueuedWrite(name);
    },
  );
};

const writeData = (name: unknown, content: unknown): Promise<undefined> => {
  const key = toText(name);
  const value = toText(content);
  let state = writeStates.get(key);
  if (!state) {
    state = { inFlight: false, next: null };
    writeStates.set(key, state);
  }
  const current = state;
  if (current.inFlight) {
    return new Promise((resolve, reject) => {
      current.next = { content: value, waiter: { resolve, reject } };
    });
  }
  current.inFlight = true;
  return sendWriteRequest(key, value).then(
    (result) => {
      flushQueuedWrite(key);
      return result;
    },
    (error: Error) => {
      flushQueuedWrite(key);
      throw error;
    },
  );
};

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

// --- Running a widget ------------------------------------------------------------------------

let cleanups: Array<() => void> = [];
let scriptElements: HTMLScriptElement[] = [];
let runId = 0;
let lastHtml: string | null = null;
let lastStyle: string | null = null;

const userStyle = document.createElement("style");
userStyle.setAttribute("data-widget-user-style", "");
document.head.append(userStyle);

const render = (style: string, html: string): void => {
  if (style !== lastStyle) {
    userStyle.textContent = style;
    lastStyle = style;
  }
  // Skipped when unchanged so a stream chunk that only extends the script does not wipe the DOM a
  // running script has already built.
  if (html !== lastHtml) {
    container.innerHTML = html;
    lastHtml = html;
  }
  scheduleMeasure();
};

const teardown = (): void => {
  runId += 1;
  const pending = cleanups;
  cleanups = [];
  pending.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      console.error("Widget cleanup failed:", error);
    }
  });
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

// Chat widgets use `Chart` without loading it. Chart.js is bundled into the runner and only
// fetched when a script mentions it and no CDN script has already defined it.
const ensureChart = async (scripts: WidgetScriptSpec[]): Promise<void> => {
  const usesChart = scripts.some(
    (script) => "content" in script && /\bChart\b/.test(script.content),
  );
  if (!usesChart || widgetWindow.Chart) {
    return;
  }
  const module = await import("chart.js/auto");
  widgetWindow.Chart = module.default;
};

const runInlineScript = (content: string, bridge: WidgetBridge): void => {
  const element = document.createElement("script");
  element.setAttribute(SCRIPT_ATTR, "");
  element.textContent = `"use strict";
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

const run = async (signature: string, scripts: WidgetScriptSpec[]): Promise<void> => {
  teardown();
  const thisRun = runId;
  currentSignature = signature;
  // Every run starts from the widget's own markup, so a script that appends builds once instead
  // of stacking on the last run.
  if (lastHtml !== null) {
    container.innerHTML = lastHtml;
  }

  // Read after the awaits below, and written from the bridge callbacks the scripts call.
  const outcome: { failure: unknown; cleanup: (() => void) | null } = {
    failure: null,
    cleanup: null,
  };
  const bridge: WidgetBridge = {
    container,
    Chart: undefined,
    sendPrompt,
    openLink,
    getData: () => latestData,
    onData: (callback) => {
      dataListeners.push(callback);
      if (hasData) {
        try {
          callback(latestData);
        } catch (error) {
          reportError(error, "listener");
          console.error("Generated widget data listener failed:", error);
        }
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
  };
  widgetWindow[BRIDGE_KEY] = bridge;
  // Home Grid widgets reach the same surface through this name as well as bare identifiers.
  widgetWindow[HOME_WIDGET_KEY] = bridge;

  try {
    await ensureChart(scripts);
    for (const script of scripts) {
      if (thisRun !== runId) {
        return;
      }
      if ("src" in script) {
        await loadExternalScript(script.src);
      } else {
        runInlineScript(script.content, bridge);
      }
      if (outcome.failure) {
        break;
      }
    }
  } catch (error) {
    outcome.failure ??= error;
  }

  if (thisRun !== runId) {
    return;
  }
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
    scriptCount: scripts.length,
    hasCleanup: outcome.cleanup !== null,
  });
  post({ type: RUNNER_MESSAGE.ready });
  scheduleMeasure();
};

// --- Messages from the host ------------------------------------------------------------------

let hostSpoke = false;

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== hostWindow) {
    return;
  }
  const message: HostMessage | null = parseHostMessage(event.data);
  if (!message) {
    return;
  }
  hostSpoke = true;

  switch (message.type) {
    case HOST_MESSAGE.ping:
      post({ type: RUNNER_MESSAGE.pong, seq: message.seq });
      return;
    case HOST_MESSAGE.render:
      render(message.style, message.html);
      return;
    case HOST_MESSAGE.run:
      void run(message.signature, message.scripts);
      return;
    case HOST_MESSAGE.teardown:
      teardown();
      return;
    case HOST_MESSAGE.data:
      latestData = message.payload;
      hasData = true;
      notifyListeners();
      scheduleMeasure();
      return;
    case HOST_MESSAGE.theme:
      document.documentElement.dataset.theme = message.theme;
      document.documentElement.style.colorScheme = message.theme;
      return;
    case HOST_MESSAGE.writeDataResult: {
      const waiter = pendingWrites.get(message.requestId);
      if (!waiter) {
        return;
      }
      pendingWrites.delete(message.requestId);
      if (message.ok) {
        waiter.resolve(undefined);
      } else {
        waiter.reject(new Error(message.error || "Write failed."));
      }
      return;
    }
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
