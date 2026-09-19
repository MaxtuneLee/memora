import widgetBaseCss from "@/styles/widgetBase.css?raw";
import svgCss from "@/styles/svg.css?raw";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

export const GENERATED_WIDGET_READY_MESSAGE = "memora:generated-widget-ready";
export const GENERATED_WIDGET_DATA_MESSAGE = "memora:generated-widget-data";
export const GENERATED_WIDGET_RESIZE_MESSAGE = "memora:generated-widget-resize";
export const GENERATED_WIDGET_SEND_PROMPT_MESSAGE = "memora:generated-widget-send-prompt";
export const GENERATED_WIDGET_OPEN_LINK_MESSAGE = "memora:generated-widget-open-link";
export const GENERATED_WIDGET_WRITE_DATA_MESSAGE = "memora:generated-widget-write-data";
export const GENERATED_WIDGET_WRITE_DATA_RESULT_MESSAGE =
  "memora:generated-widget-write-data-result";

// Same allowlist the show-widget-skills docs teach the agent (see README.md's "CDN allowlist"
// bullet). There is no browser-level CSP backing that claim, so this filter — applied when
// building the srcDoc, not at fetch time — is what actually enforces it for Home Grid widgets.
const CDN_ALLOWLIST_HOSTS = ["cdnjs.cloudflare.com", "esm.sh", "cdn.jsdelivr.net", "unpkg.com"];

// Returns the normalized, allowlisted URL to embed, or null to drop the script tag entirely.
// Re-serializing through URL() (rather than the raw attacker-controlled string) means any stray
// quote/angle-bracket in the source string is percent-encoded before it ever reaches the HTML.
const getAllowedCdnScriptHref = (src: string): string | null => {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && CDN_ALLOWLIST_HOSTS.includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
};

const escapeHtmlAttribute = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

// Exported for direct unit testing: parseShowWidgetCode already splits user script content on
// any "</script" boundary, so this guard is unreachable via buildGeneratedWidgetSrcDoc today —
// kept as defense-in-depth against future changes to how script content reaches this string build.
export const escapeClosingScriptTag = (source: string): string =>
  source.replace(/<\/script/gi, "<\\/script");

// Separate from Chat's WIDGET_BRIDGE_KEY runtime (see ADR 0006): this shim talks to the
// host exclusively over postMessage, since the iframe is sandbox="allow-scripts" with no
// allow-same-origin and cannot receive a live object reference from the parent.
export const buildGeneratedWidgetSrcDoc = (widgetCode: string): string => {
  const parsed = parseShowWidgetCode(widgetCode);
  const inlineScripts = parsed.scripts.filter((script) => !script.src);
  const externalScripts = parsed.scripts.filter(
    (script): script is { content: string; src: string } => Boolean(script.src),
  );
  const userScript = escapeClosingScriptTag(
    inlineScripts.map((script) => script.content).join("\n\n"),
  );
  // Placed before the shim/user script below: like Chat's runtime, a widget that loads Chart.js
  // (or any other UMD library) this way must set its global before the inline script that uses
  // it runs — a plain (non-async/defer) <script src> blocks HTML parsing until it resolves.
  const externalScriptTags = externalScripts
    .map((script) => getAllowedCdnScriptHref(script.src))
    .filter((href): href is string => href !== null)
    .map((href) => `<script src="${escapeHtmlAttribute(href)}"></script>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${widgetBaseCss}</style><style>${svgCss}</style><style>${parsed.styleText}</style></head><body><div id="widget-root">${parsed.htmlRenderable}</div>${externalScriptTags}<script>
(() => {
  "use strict";
  const container = document.getElementById("widget-root");
  const listeners = [];
  let latestData = null;

  // Rate-limits writeData per file name to one in-flight postMessage at a time: a call while one
  // is already pending replaces the queued content (last write wins) instead of piling up
  // requests, per ADR 0008.
  const writeState = new Map();
  const pendingWriteRequests = new Map();
  let writeRequestSeq = 0;

  const sendWriteRequest = (name, content) => {
    const requestId = String(++writeRequestSeq);
    return new Promise((resolve, reject) => {
      pendingWriteRequests.set(requestId, { resolve, reject });
      window.parent.postMessage(
        { type: "${GENERATED_WIDGET_WRITE_DATA_MESSAGE}", requestId, name, content },
        "*",
      );
    });
  };

  const flushQueuedWrite = (name) => {
    const state = writeState.get(name);
    if (!state) {
      return;
    }
    const queued = state.next;
    state.next = null;
    if (!queued) {
      state.inFlight = false;
      return;
    }
    sendWriteRequest(name, queued.content)
      .then((result) => {
        queued.resolve(result);
        flushQueuedWrite(name);
      })
      .catch((error) => {
        queued.reject(error);
        flushQueuedWrite(name);
      });
  };

  window.MEMORA_HOME_WIDGET = {
    container,
    getData: () => latestData,
    onData: (callback) => {
      listeners.push(callback);
      if (latestData !== null) {
        callback(latestData);
      }
    },
    sendPrompt: (text) => {
      window.parent.postMessage(
        { type: "${GENERATED_WIDGET_SEND_PROMPT_MESSAGE}", text: String(text ?? "") },
        "*",
      );
    },
    openLink: (url) => {
      window.parent.postMessage(
        { type: "${GENERATED_WIDGET_OPEN_LINK_MESSAGE}", url: String(url ?? "") },
        "*",
      );
    },
    writeData: (name, content) => {
      const key = String(name ?? "");
      const value = String(content ?? "");
      let state = writeState.get(key);
      if (!state) {
        state = { inFlight: false, next: null };
        writeState.set(key, state);
      }
      if (state.inFlight) {
        return new Promise((resolve, reject) => {
          state.next = { content: value, resolve, reject };
        });
      }
      state.inFlight = true;
      return sendWriteRequest(key, value)
        .then((result) => {
          flushQueuedWrite(key);
          return result;
        })
        .catch((error) => {
          flushQueuedWrite(key);
          throw error;
        });
    },
  };

  // Same bare-identifier surface Chat's runtime exposes (see chatWidget/useWidgetRuntime.ts) —
  // a widget written once against that convention needs no changes to also run here. The
  // MEMORA_HOME_WIDGET object above stays available too, for scripts that reference it directly.
  const getData = window.MEMORA_HOME_WIDGET.getData;
  const onData = window.MEMORA_HOME_WIDGET.onData;
  const sendPrompt = window.MEMORA_HOME_WIDGET.sendPrompt;
  const openLink = window.MEMORA_HOME_WIDGET.openLink;
  const writeData = window.MEMORA_HOME_WIDGET.writeData;

  const notifyResize = () => {
    const height = Math.max(1, document.documentElement.scrollHeight, document.body.scrollHeight);
    window.parent.postMessage({ type: "${GENERATED_WIDGET_RESIZE_MESSAGE}", height }, "*");
  };

  window.addEventListener("message", (event) => {
    if (!event.data) {
      return;
    }

    if (event.data.type === "${GENERATED_WIDGET_WRITE_DATA_RESULT_MESSAGE}") {
      const pending = pendingWriteRequests.get(event.data.requestId);
      if (!pending) {
        return;
      }
      pendingWriteRequests.delete(event.data.requestId);
      if (event.data.ok) {
        pending.resolve(undefined);
      } else {
        pending.reject(new Error(event.data.error || "Write failed."));
      }
      return;
    }

    if (event.data.type !== "${GENERATED_WIDGET_DATA_MESSAGE}") {
      return;
    }
    latestData = event.data.payload;
    listeners.forEach((listener) => {
      try {
        listener(latestData);
      } catch (error) {
        console.error("Generated widget data listener failed:", error);
      }
    });
    notifyResize();
  });

  new ResizeObserver(notifyResize).observe(document.body);

  try {
${userScript}
  } catch (error) {
    console.error("Generated widget script failed:", error);
  }

  window.parent.postMessage({ type: "${GENERATED_WIDGET_READY_MESSAGE}" }, "*");
  notifyResize();
})();
</script></body></html>`;
};
