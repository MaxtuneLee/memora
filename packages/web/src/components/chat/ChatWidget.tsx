import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Chart from "chart.js/auto";

import { cn } from "@/lib/cn";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import {
  getShowWidgetDebugState,
  subscribeShowWidgetDebug,
  updateShowWidgetDebug,
} from "@/lib/chat/showWidgetDebug";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

const BASE_WIDGET_STYLES = `
:host {
  color-scheme: light dark;
  display: block;
  width: 100%;
  background: transparent;
  font-family: var(--font-sans, "SF Pro Text", "Helvetica Neue", Helvetica, sans-serif);
  --color-background-primary: #ffffff;
  --color-background-secondary: #f5f5f4;
  --color-background-tertiary: #fafaf9;
  --color-background-info: #eff6ff;
  --color-background-danger: #fef2f2;
  --color-background-success: #ecfdf5;
  --color-background-warning: #fffbeb;
  --color-text-primary: #18181b;
  --color-text-secondary: #52525b;
  --color-text-tertiary: #71717a;
  --color-text-info: #1d4ed8;
  --color-text-danger: #b91c1c;
  --color-text-success: #047857;
  --color-text-warning: #b45309;
  --color-border-tertiary: rgba(24, 24, 27, 0.15);
  --color-border-secondary: rgba(24, 24, 27, 0.3);
  --color-border-primary: rgba(24, 24, 27, 0.4);
  --color-border-info: rgba(29, 78, 216, 0.35);
  --color-border-danger: rgba(185, 28, 28, 0.35);
  --color-border-success: rgba(4, 120, 87, 0.35);
  --color-border-warning: rgba(180, 83, 9, 0.35);
  --svg-gray-fill: var(--color-background-secondary);
  --svg-gray-stroke: var(--color-border-secondary);
  --svg-gray-text: var(--color-text-primary);
  --svg-gray-text-secondary: var(--color-text-secondary);
  --svg-blue-fill: var(--color-background-info);
  --svg-blue-stroke: var(--color-border-info);
  --svg-blue-text: var(--color-text-info);
  --svg-blue-text-secondary: #1e40af;
  --svg-red-fill: var(--color-background-danger);
  --svg-red-stroke: var(--color-border-danger);
  --svg-red-text: var(--color-text-danger);
  --svg-red-text-secondary: #991b1b;
  --svg-amber-fill: var(--color-background-warning);
  --svg-amber-stroke: var(--color-border-warning);
  --svg-amber-text: var(--color-text-warning);
  --svg-amber-text-secondary: #92400e;
  --svg-green-fill: var(--color-background-success);
  --svg-green-stroke: var(--color-border-success);
  --svg-green-text: var(--color-text-success);
  --svg-green-text-secondary: #065f46;
  --svg-teal-fill: #f0fdfa;
  --svg-teal-stroke: rgba(13, 148, 136, 0.32);
  --svg-teal-text: #0f766e;
  --svg-teal-text-secondary: #115e59;
  --svg-purple-fill: #faf5ff;
  --svg-purple-stroke: rgba(147, 51, 234, 0.28);
  --svg-purple-text: #7e22ce;
  --svg-purple-text-secondary: #6b21a8;
  --svg-coral-fill: #fff7ed;
  --svg-coral-stroke: rgba(234, 88, 12, 0.3);
  --svg-coral-text: #ea580c;
  --svg-coral-text-secondary: #c2410c;
  --svg-pink-fill: #fdf2f8;
  --svg-pink-stroke: rgba(219, 39, 119, 0.28);
  --svg-pink-text: #be185d;
  --svg-pink-text-secondary: #9d174d;
  --font-sans: "SF Pro Text", "Helvetica Neue", Helvetica, sans-serif;
  --font-serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --font-mono: "SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --border-radius-xl: 16px;
  --widget-control-height: 36px;
  --widget-focus-ring: 0 0 0 3px rgba(24, 24, 27, 0.08);
  --widget-range-track-height: 4px;
  --widget-range-thumb-size: 18px;
  --widget-thumb-shadow: 0 1px 2px rgba(24, 24, 27, 0.16);
}

@media (prefers-color-scheme: dark) {
  :host {
    --color-background-primary: #18181b;
    --color-background-secondary: #27272a;
    --color-background-tertiary: #09090b;
    --color-background-info: #172554;
    --color-background-danger: #450a0a;
    --color-background-success: #052e16;
    --color-background-warning: #451a03;
    --color-text-primary: #fafafa;
    --color-text-secondary: #d4d4d8;
    --color-text-tertiary: #a1a1aa;
    --color-text-info: #93c5fd;
    --color-text-danger: #fca5a5;
    --color-text-success: #6ee7b7;
    --color-text-warning: #fcd34d;
    --color-border-tertiary: rgba(244, 244, 245, 0.15);
    --color-border-secondary: rgba(244, 244, 245, 0.28);
    --color-border-primary: rgba(244, 244, 245, 0.4);
    --color-border-info: rgba(147, 197, 253, 0.35);
    --color-border-danger: rgba(252, 165, 165, 0.35);
    --color-border-success: rgba(110, 231, 183, 0.35);
    --color-border-warning: rgba(252, 211, 77, 0.35);
    --svg-blue-text-secondary: #bfdbfe;
    --svg-red-text-secondary: #fecaca;
    --svg-amber-text-secondary: #fde68a;
    --svg-green-text-secondary: #a7f3d0;
    --svg-teal-fill: #042f2e;
    --svg-teal-stroke: rgba(94, 234, 212, 0.32);
    --svg-teal-text: #5eead4;
    --svg-teal-text-secondary: #99f6e4;
    --svg-purple-fill: #2e1065;
    --svg-purple-stroke: rgba(196, 181, 253, 0.32);
    --svg-purple-text: #c4b5fd;
    --svg-purple-text-secondary: #ddd6fe;
    --svg-coral-fill: #431407;
    --svg-coral-stroke: rgba(251, 146, 60, 0.32);
    --svg-coral-text: #fb923c;
    --svg-coral-text-secondary: #fdba74;
    --svg-pink-fill: #500724;
    --svg-pink-stroke: rgba(244, 114, 182, 0.3);
    --svg-pink-text: #f472b6;
    --svg-pink-text-secondary: #f9a8d4;
    --widget-focus-ring: 0 0 0 3px rgba(244, 244, 245, 0.14);
    --widget-thumb-shadow: 0 1px 2px rgba(9, 9, 11, 0.36);
  }
}

:host, :host * {
  box-sizing: border-box;
}

[data-widget-content] {
  display: block;
  width: 100%;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

[data-widget-content] :where(button, input, select, textarea) {
  color: inherit;
  font: inherit;
}

[data-widget-content] button {
  appearance: none;
  min-height: var(--widget-control-height);
  padding: 0 14px;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    transform 120ms ease;
}

[data-widget-content] button:hover {
  background: var(--color-background-secondary);
  border-color: var(--color-border-primary);
}

[data-widget-content] button:active {
  transform: scale(0.98);
}

[data-widget-content] button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

[data-widget-content] button:focus-visible {
  outline: none;
  box-shadow: var(--widget-focus-ring);
}

[data-widget-content] input[type="range"] {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: var(--widget-range-thumb-size);
  margin: 0;
  padding: 0;
  background: transparent;
  accent-color: var(--color-text-primary);
  cursor: pointer;
}

[data-widget-content] input[type="range"]:focus {
  outline: none;
}

[data-widget-content] input[type="range"]::-webkit-slider-runnable-track {
  height: var(--widget-range-track-height);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: 999px;
  background: var(--color-background-secondary);
}

[data-widget-content] input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: var(--widget-range-thumb-size);
  height: var(--widget-range-thumb-size);
  margin-top: calc(
    (var(--widget-range-track-height) - var(--widget-range-thumb-size)) / 2
  );
  border: 0.5px solid var(--color-border-secondary);
  border-radius: 999px;
  background: var(--color-background-primary);
  box-shadow: var(--widget-thumb-shadow);
  transition:
    transform 120ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

[data-widget-content] input[type="range"]:hover::-webkit-slider-thumb {
  border-color: var(--color-border-primary);
}

[data-widget-content] input[type="range"]:active::-webkit-slider-thumb {
  transform: scale(1.05);
}

[data-widget-content] input[type="range"]:focus-visible::-webkit-slider-thumb {
  box-shadow: var(--widget-focus-ring), var(--widget-thumb-shadow);
}

[data-widget-content] input[type="range"]::-moz-range-track {
  height: var(--widget-range-track-height);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: 999px;
  background: var(--color-background-secondary);
}

[data-widget-content] input[type="range"]::-moz-range-progress {
  height: var(--widget-range-track-height);
  border-radius: 999px;
  background: var(--color-text-primary);
}

[data-widget-content] input[type="range"]::-moz-range-thumb {
  width: var(--widget-range-thumb-size);
  height: var(--widget-range-thumb-size);
  border: 0.5px solid var(--color-border-secondary);
  border-radius: 999px;
  background: var(--color-background-primary);
  box-shadow: var(--widget-thumb-shadow);
  transition:
    transform 120ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

[data-widget-content] input[type="range"]:hover::-moz-range-thumb {
  border-color: var(--color-border-primary);
}

[data-widget-content] input[type="range"]:active::-moz-range-thumb {
  transform: scale(1.05);
}

[data-widget-content] input[type="range"]:focus-visible::-moz-range-thumb {
  box-shadow: var(--widget-focus-ring), var(--widget-thumb-shadow);
}

svg :where(.t, .ts, .th, .box, .node, .arr, .leader, [class^="c-"], [class*=" c-"]) {
  --p: var(--color-text-primary);
  --s: var(--color-text-secondary);
  --t: var(--color-text-tertiary);
  --bg2: var(--color-background-secondary);
  --b: var(--color-border-tertiary);
}

svg .t,
svg .ts,
svg .th {
  font-family: var(--font-sans);
}

svg .t,
svg .th {
  fill: var(--p);
  font-size: 14px;
}

svg .ts {
  fill: var(--s);
  font-size: 12px;
}

svg .t,
svg .ts {
  font-weight: 400;
}

svg .th {
  font-weight: 500;
}

svg :is(rect, circle, ellipse, polygon).box,
svg .box > :is(rect, circle, ellipse, polygon) {
  fill: var(--bg2);
  stroke: var(--b);
  stroke-width: 0.5px;
}

svg .node {
  cursor: pointer;
  transition: opacity 160ms ease;
}

svg .node:hover {
  opacity: 0.88;
}

svg .arr {
  fill: none;
  marker-end: url(#arrow);
  stroke: var(--t);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5px;
}

svg .leader {
  fill: none;
  opacity: 0.9;
  stroke: var(--t);
  stroke-dasharray: 3 3;
  stroke-linecap: round;
  stroke-width: 0.5px;
}

svg .c-gray {
  --svg-ramp-fill: var(--svg-gray-fill);
  --svg-ramp-stroke: var(--svg-gray-stroke);
  --svg-ramp-text: var(--svg-gray-text);
  --svg-ramp-text-secondary: var(--svg-gray-text-secondary);
}

svg .c-blue {
  --svg-ramp-fill: var(--svg-blue-fill);
  --svg-ramp-stroke: var(--svg-blue-stroke);
  --svg-ramp-text: var(--svg-blue-text);
  --svg-ramp-text-secondary: var(--svg-blue-text-secondary);
}

svg .c-red {
  --svg-ramp-fill: var(--svg-red-fill);
  --svg-ramp-stroke: var(--svg-red-stroke);
  --svg-ramp-text: var(--svg-red-text);
  --svg-ramp-text-secondary: var(--svg-red-text-secondary);
}

svg .c-amber {
  --svg-ramp-fill: var(--svg-amber-fill);
  --svg-ramp-stroke: var(--svg-amber-stroke);
  --svg-ramp-text: var(--svg-amber-text);
  --svg-ramp-text-secondary: var(--svg-amber-text-secondary);
}

svg .c-green {
  --svg-ramp-fill: var(--svg-green-fill);
  --svg-ramp-stroke: var(--svg-green-stroke);
  --svg-ramp-text: var(--svg-green-text);
  --svg-ramp-text-secondary: var(--svg-green-text-secondary);
}

svg .c-teal {
  --svg-ramp-fill: var(--svg-teal-fill);
  --svg-ramp-stroke: var(--svg-teal-stroke);
  --svg-ramp-text: var(--svg-teal-text);
  --svg-ramp-text-secondary: var(--svg-teal-text-secondary);
}

svg .c-purple {
  --svg-ramp-fill: var(--svg-purple-fill);
  --svg-ramp-stroke: var(--svg-purple-stroke);
  --svg-ramp-text: var(--svg-purple-text);
  --svg-ramp-text-secondary: var(--svg-purple-text-secondary);
}

svg .c-coral {
  --svg-ramp-fill: var(--svg-coral-fill);
  --svg-ramp-stroke: var(--svg-coral-stroke);
  --svg-ramp-text: var(--svg-coral-text);
  --svg-ramp-text-secondary: var(--svg-coral-text-secondary);
}

svg .c-pink {
  --svg-ramp-fill: var(--svg-pink-fill);
  --svg-ramp-stroke: var(--svg-pink-stroke);
  --svg-ramp-text: var(--svg-pink-text);
  --svg-ramp-text-secondary: var(--svg-pink-text-secondary);
}

svg :is(rect, circle, ellipse, polygon):where(
    .c-gray,
    .c-blue,
    .c-red,
    .c-amber,
    .c-green,
    .c-teal,
    .c-purple,
    .c-coral,
    .c-pink
  ),
svg :where(
    .c-gray,
    .c-blue,
    .c-red,
    .c-amber,
    .c-green,
    .c-teal,
    .c-purple,
    .c-coral,
    .c-pink
  )
  > :is(rect, circle, ellipse, polygon) {
  fill: var(--svg-ramp-fill);
  stroke: var(--svg-ramp-stroke);
}

svg :where(
    .c-gray,
    .c-blue,
    .c-red,
    .c-amber,
    .c-green,
    .c-teal,
    .c-purple,
    .c-coral,
    .c-pink
  )
  > :is(.t, .th) {
  fill: var(--svg-ramp-text);
}

svg :where(
    .c-gray,
    .c-blue,
    .c-red,
    .c-amber,
    .c-green,
    .c-teal,
    .c-purple,
    .c-coral,
    .c-pink
  )
  > .ts {
  fill: var(--svg-ramp-text-secondary);
}

a {
  color: var(--color-text-info);
}
`;

const getWidgetLabel = (widget: ChatWidgetData): string => {
  if (widget.title) {
    return widget.title;
  }

  return "interactive_widget";
};

const IS_DEV = import.meta.env.DEV;

const formatStreamFootprint = (length: number): string => {
  if (length < 1024) {
    return `${length} chars`;
  }

  const sizeInKilobytes = length / 1024;
  return `${sizeInKilobytes.toFixed(sizeInKilobytes >= 10 ? 0 : 1)} KB`;
};

const getPlaceholderCopy = ({
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
      detail: `${loadingMessage} The stylesheet is still open, so the layout cannot render yet.`,
    };
  }

  if (hasScript && scriptReady) {
    return {
      title: "Initializing widget",
      detail: `${loadingMessage} The interactive runtime is ready to mount.`,
    };
  }

  if (hasScript && !scriptReady) {
    return {
      title: "Streaming interactions",
      detail: `${loadingMessage} The widget script is still being generated.`,
    };
  }

  if (htmlText.trim()) {
    return {
      title: "Streaming layout",
      detail: `${loadingMessage} Markup is arriving and will render as soon as the current chunk is balanced.`,
    };
  }

  return {
    title: "Preparing widget",
    detail: loadingMessage,
  };
};

const formatDebugTimestamp = (value: number): string => {
  const date = new Date(value);
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(
    date.getMilliseconds(),
  ).padStart(3, "0")}`;
};

interface ChatWidgetProps {
  widget: ChatWidgetData;
  onSendPrompt?: (text: string) => Promise<void> | void;
}

function ChatWidgetComponent({
  widget,
  onSendPrompt,
}: ChatWidgetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const userStyleRef = useRef<HTMLStyleElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const executedSignatureRef = useRef("");
  const parsedCode = useMemo(
    () => parseShowWidgetCode(widget.widgetCode),
    [widget.widgetCode],
  );
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [hasRuntimeDom, setHasRuntimeDom] = useState(false);
  const [runtimeError, setRuntimeError] = useState<{
    signature: string;
    message: string;
  } | null>(null);
  const debugState = useSyncExternalStore(
    subscribeShowWidgetDebug,
    () => getShowWidgetDebugState(widget.toolCallId),
    () => getShowWidgetDebugState(widget.toolCallId),
  );
  const teardownWidgetScript = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    executedSignatureRef.current = "";
  }, []);
  const loadingMessages = widget.loadingMessages;
  const activeLoadingMessage =
    loadingMessages.length > 0
      ? loadingMessages[loadingIndex % loadingMessages.length]
      : "Rendering widget...";
  const executionSignature = [
    parsedCode.styleText,
    parsedCode.htmlText,
    parsedCode.scriptText,
  ].join("\u0000");
  const visibleError =
    widget.errorMessage ??
    (runtimeError?.signature === executionSignature ? runtimeError.message : null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadowRootRef.current = shadowRoot;

    if (!userStyleRef.current || !contentRef.current) {
      shadowRoot.replaceChildren();

      const baseStyle = document.createElement("style");
      baseStyle.textContent = BASE_WIDGET_STYLES;

      const userStyle = document.createElement("style");
      userStyle.setAttribute("data-widget-user-style", "");

      const content = document.createElement("div");
      content.setAttribute("data-widget-content", "");

      shadowRoot.append(baseStyle, userStyle, content);
      userStyleRef.current = userStyle;
      contentRef.current = content;
    }
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }

    const syncRuntimeDom = () => {
      const nextHasRuntimeDom =
        content.childElementCount > 0 ||
        (content.textContent?.trim().length ?? 0) !== 0;
      setHasRuntimeDom(nextHasRuntimeDom);
    };

    syncRuntimeDom();

    const observer = new MutationObserver(() => {
      syncRuntimeDom();
    });

    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (loadingMessages.length <= 1 || widget.phase === "ready") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingIndex((value) => (value + 1) % loadingMessages.length);
    }, 1600);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadingMessages, widget.phase]);

  useEffect(() => {
    if (!userStyleRef.current || !contentRef.current) {
      return;
    }

    userStyleRef.current.textContent = parsedCode.styleText;
    contentRef.current.innerHTML = parsedCode.htmlRenderable;
  }, [parsedCode.htmlRenderable, parsedCode.styleText]);

  useEffect(() => {
    updateShowWidgetDebug(
      widget.toolCallId,
      {
        widgetCode: widget.widgetCode,
        phase: widget.phase,
      },
      {
        type: "widget-parse-state",
        summary: "Widget parse state updated",
        details: {
          phase: widget.phase,
          widgetCodeLength: widget.widgetCode.length,
          styleLength: parsedCode.styleText.length,
          hasStyle: parsedCode.hasStyle,
          styleReady: parsedCode.styleReady,
          htmlLength: parsedCode.htmlText.length,
          htmlRenderableLength: parsedCode.htmlRenderable.length,
          hasScript: parsedCode.hasScript,
          scriptLength: parsedCode.scriptText.length,
          scriptReady: parsedCode.scriptReady,
          hasRuntimeDom,
          visibleError,
        },
      },
    );
  }, [
    hasRuntimeDom,
    parsedCode.hasScript,
    parsedCode.hasStyle,
    parsedCode.htmlRenderable,
    parsedCode.htmlText,
    parsedCode.scriptReady,
    parsedCode.scriptText,
    parsedCode.styleReady,
    parsedCode.styleText,
    visibleError,
    widget.phase,
    widget.toolCallId,
    widget.widgetCode,
  ]);

  useEffect(() => {
    if (!shadowRootRef.current || !contentRef.current) {
      teardownWidgetScript();
      return;
    }

    if (widget.phase === "error") {
      teardownWidgetScript();
      return;
    }

    if (!parsedCode.hasScript || !parsedCode.scriptReady || !parsedCode.scriptText.trim()) {
      teardownWidgetScript();
      return;
    }

    const signature = executionSignature;
    if (executedSignatureRef.current === signature) {
      return;
    }

    teardownWidgetScript();
    executedSignatureRef.current = signature;
    updateShowWidgetDebug(
      widget.toolCallId,
      {
        phase: widget.phase,
      },
      {
        type: "widget-script-start",
        summary: "Executing widget script",
        details: {
          htmlRenderableLength: parsedCode.htmlRenderable.length,
          scriptLength: parsedCode.scriptText.length,
        },
      },
    );
    setRuntimeError((currentError) => {
      if (currentError?.signature !== signature) {
        return currentError;
      }

      return null;
    });

    const sendPrompt = (text: string) => {
      if (!onSendPrompt) {
        return Promise.resolve();
      }

      return Promise.resolve(onSendPrompt(text));
    };

    const openLink = (url: string) => {
      if (typeof url !== "string" || !url.trim()) {
        return;
      }

      window.open(url.trim(), "_blank", "noopener,noreferrer");
    };

    try {
      const runWidgetScript = new Function(
        "shadowRoot",
        "container",
        "Chart",
        "sendPrompt",
        "openLink",
        `"use strict";
const root = container;
const document = shadowRoot;
${parsedCode.scriptText}`,
      ) as (
        shadowRoot: ShadowRoot,
        container: HTMLDivElement,
        chart: typeof Chart,
        sendPrompt: (text: string) => Promise<void>,
        openLink: (url: string) => void,
      ) => unknown;

      const cleanup = runWidgetScript(
        shadowRootRef.current,
        contentRef.current,
        Chart,
        sendPrompt,
        openLink,
      );

      if (typeof cleanup === "function") {
        cleanupRef.current = cleanup as () => void;
      }
      updateShowWidgetDebug(
        widget.toolCallId,
        {
          phase: widget.phase,
        },
        {
          type: "widget-script-success",
          summary: "Widget script executed",
          details: {
            returnedCleanup: typeof cleanup === "function",
          },
        },
      );
    } catch (error) {
      updateShowWidgetDebug(
        widget.toolCallId,
        {
          phase: "error",
        },
        {
          type: "widget-script-error",
          summary: "Widget script threw during execution",
          details: {
            message:
              error instanceof Error
                ? error.message
                : "Widget script failed to execute.",
          },
        },
      );
      queueMicrotask(() => {
        setRuntimeError({
          signature,
          message:
            error instanceof Error
              ? error.message
              : "Widget script failed to execute.",
        });
      });
    }

    return () => {
      if (executedSignatureRef.current === signature) {
        teardownWidgetScript();
      }
    };
  }, [
    executionSignature,
    onSendPrompt,
    parsedCode.htmlRenderable.length,
    parsedCode.hasScript,
    parsedCode.scriptReady,
    parsedCode.scriptText,
    teardownWidgetScript,
    widget.phase,
    widget.toolCallId,
  ]);

  useEffect(() => {
    return () => {
      teardownWidgetScript();
    };
  }, [teardownWidgetScript]);

  const hasRenderableHtml = parsedCode.htmlRenderable.trim().length > 0;
  const hasVisibleWidgetDom = hasRenderableHtml || hasRuntimeDom;
  const placeholderCopy = getPlaceholderCopy({
    widgetCode: widget.widgetCode,
    hasStyle: parsedCode.hasStyle,
    styleReady: parsedCode.styleReady,
    htmlText: parsedCode.htmlText,
    hasScript: parsedCode.hasScript,
    scriptReady: parsedCode.scriptReady,
    loadingMessage: activeLoadingMessage,
  });
  const showLoadingState = widget.phase !== "ready" && hasVisibleWidgetDom;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/70">
      <div className="border-b border-zinc-200/80 px-3 py-2">
        <p className="font-mono text-[11px] text-zinc-500">{getWidgetLabel(widget)}</p>
      </div>
      {!hasVisibleWidgetDom && (
        <div className="px-3 py-3">
          <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white/90 px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,244,245,0.95),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(250,250,249,0.92))]" />
            <div className="relative space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="relative flex size-2.5 shrink-0">
                    <span className="absolute inset-0 animate-ping rounded-full bg-zinc-300/80" />
                    <span className="relative size-2.5 rounded-full bg-zinc-600" />
                  </span>
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {placeholderCopy.title}
                  </p>
                </div>
                {widget.widgetCode.length > 0 && (
                  <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-100/90 px-2 py-1 font-mono text-[10px] text-zinc-500">
                    {formatStreamFootprint(widget.widgetCode.length)}
                  </span>
                )}
              </div>
              <p className="text-xs leading-5 text-zinc-500">{placeholderCopy.detail}</p>
              <div className="space-y-2">
                <div className="h-2.5 w-5/12 animate-pulse rounded-full bg-zinc-200/80" />
                <div className="h-20 animate-pulse rounded-[20px] border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(244,244,245,0.92),rgba(255,255,255,0.98))]" />
                <div className="flex gap-2">
                  <div className="h-8 w-24 animate-pulse rounded-xl bg-zinc-200/80" />
                  <div className="h-8 w-20 animate-pulse rounded-xl bg-zinc-100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        ref={hostRef}
        className={cn("w-full px-3 py-3", !hasVisibleWidgetDom && "hidden")}
      />
      {showLoadingState && (
        <div className="border-t border-zinc-200/80 bg-white/80 px-3 py-2 text-xs text-zinc-500">
          {activeLoadingMessage}
        </div>
      )}
      {visibleError && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {visibleError}
        </div>
      )}
      {IS_DEV && (
        <details className="border-t border-zinc-200/80 bg-zinc-950 text-zinc-100">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium tracking-[0.02em]">
            Widget Debug
          </summary>
          <div className="space-y-3 px-3 py-3">
            <div className="grid gap-2 text-[11px] text-zinc-300 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className="text-zinc-500">phase</span>: {widget.phase}
              </div>
              <div>
                <span className="text-zinc-500">args buffer</span>:{" "}
                {formatStreamFootprint(debugState.argsBuffer.length)}
              </div>
              <div>
                <span className="text-zinc-500">widget_code</span>:{" "}
                {formatStreamFootprint(widget.widgetCode.length)}
              </div>
              <div>
                <span className="text-zinc-500">style</span>:{" "}
                {parsedCode.hasStyle ? (parsedCode.styleReady ? "ready" : "streaming") : "none"}
              </div>
              <div>
                <span className="text-zinc-500">html</span>:{" "}
                {hasRenderableHtml
                  ? `${formatStreamFootprint(parsedCode.htmlRenderable.length)} renderable`
                  : parsedCode.htmlText.trim()
                    ? "present but not renderable yet"
                    : "empty"}
              </div>
              <div>
                <span className="text-zinc-500">script</span>:{" "}
                {parsedCode.hasScript
                  ? parsedCode.scriptReady
                    ? "ready"
                    : "streaming"
                  : "none"}
              </div>
              <div>
                <span className="text-zinc-500">runtime dom</span>:{" "}
                {hasRuntimeDom ? "mounted" : "empty"}
              </div>
              <div>
                <span className="text-zinc-500">latest delta</span>:{" "}
                {formatStreamFootprint(debugState.latestDelta.length)}
              </div>
              <div>
                <span className="text-zinc-500">events</span>: {debugState.events.length}
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Raw Args Buffer
              </p>
              <pre className="max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-amber-100 whitespace-pre-wrap break-all">
                {debugState.argsBuffer || "(empty)"}
              </pre>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Extracted Widget Code
              </p>
              <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-emerald-100 whitespace-pre-wrap break-all">
                {widget.widgetCode || "(empty)"}
              </pre>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Recent Events
              </p>
              <div className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/20">
                {debugState.events.length > 0 ? (
                  debugState.events
                    .slice()
                    .reverse()
                    .map((event, index) => (
                      <div
                        key={`${event.at}-${event.type}-${index}`}
                        className="border-b border-white/5 px-3 py-2 last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-3 text-[11px]">
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-100">{event.summary}</p>
                            <p className="font-mono text-zinc-500">{event.type}</p>
                          </div>
                          <span className="shrink-0 font-mono text-zinc-500">
                            {formatDebugTimestamp(event.at)}
                          </span>
                        </div>
                        {event.details && (
                          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/20 p-2 font-mono text-[10px] leading-5 text-zinc-300">
                            {JSON.stringify(event.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))
                ) : (
                  <div className="px-3 py-2 text-[11px] text-zinc-500">No debug events yet.</div>
                )}
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

const areChatWidgetPropsEqual = (
  previousProps: ChatWidgetProps,
  nextProps: ChatWidgetProps,
): boolean => {
  return (
    previousProps.widget === nextProps.widget &&
    previousProps.onSendPrompt === nextProps.onSendPrompt
  );
};

export const ChatWidget = memo(ChatWidgetComponent, areChatWidgetPropsEqual);
