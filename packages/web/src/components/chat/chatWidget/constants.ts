import widgetBaseCss from "@/styles/widgetBase.css?raw";
import svgCss from "@/styles/svg.css?raw";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import type { ResolvedTheme } from "@/lib/theme/documentTheme";

export const IS_DEV = import.meta.env.DEV;
export const WIDGET_BRIDGE_KEY = "__MEMORA_WIDGET_BRIDGE__";
export const WIDGET_CLEANUP_KEY = "__MEMORA_WIDGET_CLEANUP__";
export const WIDGET_ERROR_KEY = "__MEMORA_WIDGET_ERROR__";
export const WIDGET_SCRIPT_ATTR = "data-widget-runtime-script";

// The initial theme is baked into the markup so the frame's first paint already matches the
// app — bindIframeDocument (useWidgetIframe) only needs to keep it in sync afterward. Mirrors
// buildGeneratedWidgetSrcDoc's data-theme + color-scheme attributes for the sandboxed widgets.
export const buildWidgetIframeSrcDoc = (theme: ResolvedTheme): string =>
  `<!doctype html><html data-theme="${theme}" style="color-scheme: ${theme}"><head><meta charset="utf-8" /><style>${widgetBaseCss}</style><style>${svgCss}</style><style data-widget-user-style></style></head><body><div data-widget-content></div></body></html>`;

export interface WidgetIframeWindow extends Window {
  [WIDGET_BRIDGE_KEY]?: {
    Chart: typeof import("chart.js/auto").default;
    container: HTMLDivElement;
    openLink: (url: string) => void;
    sendPrompt: (text: string) => Promise<void>;
    getData: () => unknown;
    onData: (callback: (data: unknown) => void) => void;
    writeData: (name: string, content: string) => Promise<void>;
  };
  [WIDGET_CLEANUP_KEY]?: (() => void) | null;
  [WIDGET_ERROR_KEY]?: string | null;
}

export const getWidgetLabel = (widget: ChatWidgetData): string => {
  return widget.title || "interactive_widget";
};

export const formatStreamFootprint = (length: number): string => {
  if (length < 1024) {
    return `${length} chars`;
  }

  const sizeInKilobytes = length / 1024;
  return `${sizeInKilobytes.toFixed(sizeInKilobytes >= 10 ? 0 : 1)} KB`;
};

export const getPlaceholderCopy = ({
  widgetCode,
  hasStyle,
  styleReady,
  htmlText,
  hasScript,
  scriptReady,
  loadingMessage,
}: {
  widgetCode: string;
  hasStyle: boolean;
  styleReady: boolean;
  htmlText: string;
  hasScript: boolean;
  scriptReady: boolean;
  loadingMessage: string;
}): { title: string; detail: string } => {
  if (!widgetCode.trim()) {
    return {
      title: "Waiting for widget payload",
      detail: loadingMessage,
    };
  }
  if (hasStyle && !styleReady) {
    return {
      title: "Streaming styles",
      detail: loadingMessage,
    };
  }
  if (hasScript && scriptReady) {
    return {
      title: "Initializing widget",
      detail: loadingMessage,
    };
  }
  if (hasScript && !scriptReady) {
    return {
      title: "Streaming interactions",
      detail: loadingMessage,
    };
  }
  if (htmlText.trim()) {
    return {
      title: "Streaming layout",
      detail: loadingMessage,
    };
  }
  return {
    title: "Preparing widget",
    detail: loadingMessage,
  };
};

export const formatDebugTimestamp = (value: number): string => {
  const date = new Date(value);
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(
    date.getMilliseconds(),
  ).padStart(3, "0")}`;
};
