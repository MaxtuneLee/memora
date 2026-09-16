import { memo, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as stylex from "@stylexjs/stylex";

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
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import { getShowWidgetDebugState, subscribeShowWidgetDebug } from "@/lib/chat/showWidgetDebug";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

const styles = stylex.create({
  root: {
    backgroundColor: "rgb(250 250 250 / 0.7)",
    border: "1px solid rgb(228 228 231 / 0.8)",
    borderRadius: 16,
    overflow: "hidden",
  },
  header: { borderBottom: "1px solid rgb(228 228 231 / 0.8)", paddingBlock: 8, paddingInline: 12 },
  label: { color: "#71717a", fontFamily: "monospace", fontSize: 11, margin: 0 },
  iframeWrap: { padding: 12 },
  hidden: { display: "none" },
  iframe: { backgroundColor: "transparent", border: 0, display: "block", width: "100%" },
  loading: {
    backgroundColor: "rgb(255 255 255 / 0.8)",
    borderTop: "1px solid rgb(228 228 231 / 0.8)",
    color: "#71717a",
    fontSize: 12,
    paddingBlock: 8,
    paddingInline: 12,
  },
  error: {
    backgroundColor: "#fef2f2",
    borderTop: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: 12,
    paddingBlock: 8,
    paddingInline: 12,
  },
});

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
  const visibleError = widget.errorMessage ?? runtimeError?.message ?? null;
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
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.header)}>
        <p {...stylex.props(styles.label)}>{getWidgetLabel(widget)}</p>
      </div>
      {!hasVisibleWidgetDom && (
        <WidgetPlaceholder
          title={placeholderCopy.title}
          detail={placeholderCopy.detail}
          widgetCodeLength={widget.widgetCode.length}
        />
      )}
      <div {...stylex.props(styles.iframeWrap, !hasVisibleWidgetDom && styles.hidden)}>
        <iframe
          ref={iframeRef}
          title={getWidgetLabel(widget)}
          srcDoc={WIDGET_IFRAME_SRC_DOC}
          {...stylex.props(styles.iframe)}
          style={{ height: `${iframeHeight}px` }}
          scrolling="no"
          onLoad={bindIframeDocument}
        />
      </div>
      {showLoadingState && <div {...stylex.props(styles.loading)}>{activeLoadingMessage}</div>}
      {visibleError && <div {...stylex.props(styles.error)}>{visibleError}</div>}
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
