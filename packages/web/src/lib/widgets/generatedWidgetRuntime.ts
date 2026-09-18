import widgetBaseCss from "@/styles/widgetBase.css?raw";
import svgCss from "@/styles/svg.css?raw";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

export const GENERATED_WIDGET_READY_MESSAGE = "memora:generated-widget-ready";
export const GENERATED_WIDGET_DATA_MESSAGE = "memora:generated-widget-data";
export const GENERATED_WIDGET_RESIZE_MESSAGE = "memora:generated-widget-resize";

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
  const userScript = escapeClosingScriptTag(
    parsed.scripts.map((script) => script.content).join("\n\n"),
  );

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${widgetBaseCss}</style><style>${svgCss}</style><style>${parsed.styleText}</style></head><body><div id="widget-root">${parsed.htmlRenderable}</div><script>
(() => {
  "use strict";
  const container = document.getElementById("widget-root");
  const listeners = [];
  let latestData = null;

  window.MEMORA_HOME_WIDGET = {
    container,
    getData: () => latestData,
    onData: (callback) => {
      listeners.push(callback);
      if (latestData !== null) {
        callback(latestData);
      }
    },
  };

  const notifyResize = () => {
    const height = Math.max(1, document.documentElement.scrollHeight, document.body.scrollHeight);
    window.parent.postMessage({ type: "${GENERATED_WIDGET_RESIZE_MESSAGE}", height }, "*");
  };

  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "${GENERATED_WIDGET_DATA_MESSAGE}") {
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
