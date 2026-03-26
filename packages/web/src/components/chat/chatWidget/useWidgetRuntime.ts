import Chart from "chart.js/auto";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import { updateShowWidgetDebug } from "@/lib/chat/showWidgetDebug";
import type { ParsedShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

import {
  WIDGET_BRIDGE_KEY,
  WIDGET_CLEANUP_KEY,
  WIDGET_ERROR_KEY,
  WIDGET_SCRIPT_ATTR,
  type WidgetIframeWindow,
} from "./constants";

export const useWidgetRuntime = ({
  widget,
  parsedCode,
  iframeReady,
  iframeDocumentRef,
  userStyleRef,
  contentRef,
  hasRuntimeDom,
  onSendPrompt,
  syncIframeHeight,
}: {
  widget: ChatWidgetData;
  parsedCode: ParsedShowWidgetCode;
  iframeReady: boolean;
  iframeDocumentRef: MutableRefObject<Document | null>;
  userStyleRef: MutableRefObject<HTMLStyleElement | null>;
  contentRef: MutableRefObject<HTMLDivElement | null>;
  hasRuntimeDom: boolean;
  onSendPrompt?: (text: string) => Promise<void> | void;
  syncIframeHeight: () => void;
}) => {
  const scriptElementsRef = useRef<HTMLScriptElement[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const executedSignatureRef = useRef("");
  const [runtimeError, setRuntimeError] = useState<{
    signature: string;
    message: string;
  } | null>(null);
  const executionSignature = [
    parsedCode.styleText,
    parsedCode.htmlText,
    parsedCode.scriptText,
  ].join("\u0000");
  const visibleError =
    widget.errorMessage ??
    (runtimeError?.signature === executionSignature ? runtimeError.message : null);

  const teardownWidgetScript = useCallback(() => {
    const iframeWindow = iframeDocumentRef.current?.defaultView as WidgetIframeWindow | null;

    cleanupRef.current?.();
    cleanupRef.current = null;
    scriptElementsRef.current.forEach((element) => {
      element.remove();
    });
    scriptElementsRef.current = [];
    if (iframeWindow) {
      delete iframeWindow[WIDGET_BRIDGE_KEY];
      delete iframeWindow[WIDGET_CLEANUP_KEY];
      delete iframeWindow[WIDGET_ERROR_KEY];
    }
    executedSignatureRef.current = "";
  }, [iframeDocumentRef]);

  useEffect(() => {
    if (!iframeReady || !userStyleRef.current || !contentRef.current) {
      return;
    }

    userStyleRef.current.textContent = parsedCode.styleText;
    contentRef.current.innerHTML = parsedCode.htmlRenderable;
    syncIframeHeight();
  }, [
    contentRef,
    iframeReady,
    parsedCode.htmlRenderable,
    parsedCode.styleText,
    syncIframeHeight,
    userStyleRef,
  ]);

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
  }, [hasRuntimeDom, parsedCode, visibleError, widget.phase, widget.toolCallId, widget.widgetCode]);

  useEffect(() => {
    if (!iframeReady || !iframeDocumentRef.current || !contentRef.current) {
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
      { phase: widget.phase },
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
      return currentError?.signature === signature ? null : currentError;
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

    const handleRuntimeError = (error: unknown) => {
      updateShowWidgetDebug(
        widget.toolCallId,
        { phase: "error" },
        {
          type: "widget-script-error",
          summary: "Widget script threw during execution",
          details: {
            message: error instanceof Error ? error.message : "Widget script failed to execute.",
          },
        },
      );
      queueMicrotask(() => {
        setRuntimeError({
          signature,
          message: error instanceof Error ? error.message : "Widget script failed to execute.",
        });
      });
    };

    try {
      const iframeDocument = iframeDocumentRef.current;
      const iframeWindow = iframeDocument.defaultView as WidgetIframeWindow | null;
      if (!iframeWindow || !contentRef.current) {
        throw new Error("Widget iframe window is unavailable.");
      }

      iframeWindow[WIDGET_BRIDGE_KEY] = {
        Chart,
        container: contentRef.current,
        openLink,
        sendPrompt,
      };
      iframeWindow[WIDGET_CLEANUP_KEY] = null;
      iframeWindow[WIDGET_ERROR_KEY] = null;

      const appendScriptElement = (scriptElement: HTMLScriptElement): Promise<void> => {
        scriptElementsRef.current.push(scriptElement);
        return new Promise((resolve, reject) => {
          scriptElement.addEventListener("load", () => resolve(), { once: true });
          scriptElement.addEventListener(
            "error",
            () => {
              reject(
                new Error(iframeWindow[WIDGET_ERROR_KEY] ?? "Widget script failed to execute."),
              );
            },
            { once: true },
          );
          iframeDocument.body.append(scriptElement);
          if (!scriptElement.src) {
            resolve();
          }
        });
      };

      const runScripts = async () => {
        for (const script of parsedCode.scripts) {
          const scriptElement = iframeDocument.createElement("script");
          scriptElement.type = "text/javascript";
          scriptElement.setAttribute(WIDGET_SCRIPT_ATTR, signature);
          if (script.src) {
            scriptElement.src = script.src;
            await appendScriptElement(scriptElement);
            continue;
          }

          scriptElement.textContent = `"use strict";
(() => {
  const bridge = window.${WIDGET_BRIDGE_KEY};
  if (!bridge) {
    throw new Error("Widget bridge is unavailable.");
  }

  const shadowRoot = document;
  const container = bridge.container;
  const root = container;
  const Chart = window.Chart ?? bridge.Chart;
  const sendPrompt = bridge.sendPrompt;
  const openLink = bridge.openLink;

  try {
    const cleanup = (() => {
${script.content}
    })();
    if (typeof cleanup === "function") {
      window.${WIDGET_CLEANUP_KEY} = cleanup;
    }
    window.${WIDGET_ERROR_KEY} = null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Widget script failed to execute.";
    window.${WIDGET_ERROR_KEY} = message;
    throw error;
  }
})();`;
          await appendScriptElement(scriptElement);
        }
      };

      void runScripts()
        .then(() => {
          const cleanup = iframeWindow[WIDGET_CLEANUP_KEY];
          if (typeof cleanup === "function") {
            cleanupRef.current = cleanup;
          }
          if (iframeWindow[WIDGET_ERROR_KEY]) {
            throw new Error(iframeWindow[WIDGET_ERROR_KEY] ?? "Widget script failed to execute.");
          }
          syncIframeHeight();
          updateShowWidgetDebug(
            widget.toolCallId,
            { phase: widget.phase },
            {
              type: "widget-script-success",
              summary: "Widget script executed",
              details: {
                returnedCleanup: typeof cleanup === "function",
                scriptCount: parsedCode.scripts.length,
              },
            },
          );
        })
        .catch(handleRuntimeError);

      updateShowWidgetDebug(
        widget.toolCallId,
        { phase: widget.phase },
        {
          type: "widget-script-success",
          summary: "Widget scripts scheduled",
          details: {
            scriptCount: parsedCode.scripts.length,
          },
        },
      );
    } catch (error) {
      handleRuntimeError(error);
    }

    return () => {
      if (executedSignatureRef.current === signature) {
        teardownWidgetScript();
      }
    };
  }, [
    contentRef,
    executionSignature,
    iframeDocumentRef,
    iframeReady,
    onSendPrompt,
    parsedCode,
    syncIframeHeight,
    teardownWidgetScript,
    widget.phase,
    widget.toolCallId,
  ]);

  useEffect(() => {
    return () => {
      teardownWidgetScript();
    };
  }, [teardownWidgetScript]);

  return {
    runtimeError,
  };
};
