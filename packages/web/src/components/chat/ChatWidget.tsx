import {
  memo,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { WidgetDebugPanel } from "@/components/chat/chatWidget/WidgetDebugPanel";
import { WidgetPlaceholder } from "@/components/chat/chatWidget/WidgetPlaceholder";
import {
  IS_DEV,
  WIDGET_IFRAME_SRC_DOC,
  getPlaceholderCopy,
  getWidgetLabel,
} from "@/components/chat/chatWidget/constants";
import { useWidgetIframe } from "@/components/chat/chatWidget/useWidgetIframe";
import { useWidgetRuntime } from "@/components/chat/chatWidget/useWidgetRuntime";
import { cn } from "@/lib/cn";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import {
  getShowWidgetDebugState,
  subscribeShowWidgetDebug,
} from "@/lib/chat/showWidgetDebug";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

interface ChatWidgetProps {
  widget: ChatWidgetData;
  onSendPrompt?: (text: string) => Promise<void> | void;
}

function ChatWidgetComponent({ widget, onSendPrompt }: ChatWidgetProps) {
  const parsedCode = useMemo(() => {
    return parseShowWidgetCode(widget.widgetCode);
  }, [widget.widgetCode]);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const {
    iframeRef,
    iframeDocumentRef,
    userStyleRef,
    contentRef,
    iframeReady,
    iframeHeight,
    hasRuntimeDom,
    bindIframeDocument,
    syncIframeHeight,
  } = useWidgetIframe();
  const { runtimeError } = useWidgetRuntime({
    widget,
    parsedCode,
    iframeReady,
    iframeDocumentRef,
    userStyleRef,
    contentRef,
    hasRuntimeDom,
    onSendPrompt,
    syncIframeHeight,
  });
  const debugState = useSyncExternalStore(
    subscribeShowWidgetDebug,
    () => getShowWidgetDebugState(widget.toolCallId),
    () => getShowWidgetDebugState(widget.toolCallId),
  );

  useEffect(() => {
    if (widget.loadingMessages.length <= 1 || widget.phase === "ready") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingIndex((value) => (value + 1) % widget.loadingMessages.length);
    }, 1600);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [widget.loadingMessages, widget.phase]);

  const activeLoadingMessage =
    widget.loadingMessages.length > 0
      ? widget.loadingMessages[loadingIndex % widget.loadingMessages.length]
      : "Rendering widget...";
  const visibleError =
    widget.errorMessage ?? runtimeError?.message ?? null;
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
        <p className="font-mono text-[11px] text-zinc-500">
          {getWidgetLabel(widget)}
        </p>
      </div>
      {!hasVisibleWidgetDom && (
        <WidgetPlaceholder
          title={placeholderCopy.title}
          detail={placeholderCopy.detail}
          widgetCodeLength={widget.widgetCode.length}
        />
      )}
      <div className={cn("px-3 py-3", !hasVisibleWidgetDom && "hidden")}>
        <iframe
          ref={iframeRef}
          title={getWidgetLabel(widget)}
          srcDoc={WIDGET_IFRAME_SRC_DOC}
          className="block w-full border-0 bg-transparent"
          style={{ height: `${iframeHeight}px` }}
          scrolling="no"
          onLoad={bindIframeDocument}
        />
      </div>
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
        <WidgetDebugPanel
          widget={widget}
          debugState={debugState}
          parsedCode={parsedCode}
          hasRenderableHtml={hasRenderableHtml}
          hasRuntimeDom={hasRuntimeDom}
        />
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
