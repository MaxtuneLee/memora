import { Toast } from "@base-ui/react/toast";
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as stylex from "@stylexjs/stylex";

import { WidgetDebugPanel } from "@/components/chat/chatWidget/WidgetDebugPanel";
import { WidgetPlaceholder } from "@/components/chat/chatWidget/WidgetPlaceholder";
import { SaveWidgetDefinitionDialog } from "@/components/chat/chatWidget/SaveWidgetDefinitionDialog";
import {
  IS_DEV,
  buildWidgetIframeSrcDoc,
  getPlaceholderCopy,
  getWidgetLabel,
} from "@/components/chat/chatWidget/constants";
import { useWidgetIframe } from "@/components/chat/chatWidget/useWidgetIframe";
import { useWidgetRuntime } from "@/components/chat/chatWidget/useWidgetRuntime";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import { getShowWidgetDebugState, subscribeShowWidgetDebug } from "@/lib/chat/showWidgetDebug";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";
import { useAppStore } from "@/livestore/store";
import { saveChatWidgetDefinition } from "@/lib/widgets/saveChatWidgetDefinition";
import { useDataSourceValue, type DataSourceValueState } from "@/hooks/widgets/useDataSourceValue";
import { usePreviewWidgetData } from "@/hooks/widgets/usePreviewWidgetData";
import { useResolvedTheme } from "@/hooks/theme/useResolvedTheme";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: tokens.surfaceSoft,
    border: `1px solid ${tokens.border}`,
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottom: `1px solid ${tokens.border}`,
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    paddingBlock: 8,
    paddingInline: 12,
  },
  label: { color: tokens.textMuted, fontFamily: "monospace", fontSize: 11, margin: 0 },
  saveButton: {
    alignItems: "center",
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 9999,
    color: tokens.textMuted,
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 600,
    gap: 5,
    minHeight: 28,
    paddingBlock: 4,
    paddingInline: 9,
    ":hover": {
      backgroundColor: tokens.hover,
      borderColor: tokens.oliveSoft,
      color: tokens.text,
    },
    ":focus-visible": {
      outline: `2px solid ${tokens.oliveSoft}`,
      outlineOffset: 2,
    },
  },
  saveIcon: { height: 14, width: 14 },
  iframeWrap: { padding: 12 },
  hidden: { display: "none" },
  iframe: { backgroundColor: "transparent", border: 0, display: "block", width: "100%" },
  loading: {
    backgroundColor: tokens.surface,
    borderTop: `1px solid ${tokens.border}`,
    color: tokens.textMuted,
    fontSize: 12,
    paddingBlock: 8,
    paddingInline: 12,
  },
  error: {
    backgroundColor: tokens.dangerSurface,
    borderTop: `1px solid ${tokens.dangerBorder}`,
    color: tokens.dangerText,
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
  const store = useAppStore();
  const parsedCode = useMemo(() => {
    return parseShowWidgetCode(widget.widgetCode);
  }, [widget.widgetCode]);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [savedDefinitionId, setSavedDefinitionId] = useState<string | null>(null);
  const { add: addToast } = Toast.useToastManager();
  // "widgetData" has no Definition/folder yet in preview (the widget hasn't been saved) — it
  // reads back the in-memory writes from usePreviewWidgetData instead of the catalog (ADR 0008).
  const isWidgetDataBound = widget.dataSourceName === "widgetData";
  const previewWidgetData = usePreviewWidgetData(widget.dataFiles);
  const catalogDataState = useDataSourceValue(
    store,
    isWidgetDataBound ? null : (widget.dataSourceName ?? null),
    widget.dataSourceParams ?? {},
  );
  const dataState: DataSourceValueState | null = isWidgetDataBound
    ? { status: "ready", value: previewWidgetData.value }
    : catalogDataState;
  const resolvedTheme = useResolvedTheme();
  // Only the first theme goes into the srcDoc, matching Home Grid's sandboxed widgets — later
  // changes reach the same-origin frame directly through useWidgetIframe's effect, never a reload.
  const [initialTheme] = useState(resolvedTheme);
  const iframeSrcDoc = useMemo(() => buildWidgetIframeSrcDoc(initialTheme), [initialTheme]);
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
    dataState,
    onWriteData: previewWidgetData.write,
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
  const canSave =
    widget.phase === "ready" && hasVisibleWidgetDom && widget.widgetCode.trim().length > 0;
  const handleSaveDefinition = useCallback(
    async (input: Parameters<typeof saveChatWidgetDefinition>[0]["input"]) => {
      const result = await saveChatWidgetDefinition({
        store,
        input: { ...input, existingDefinitionId: savedDefinitionId ?? undefined },
      });
      if (result.ok) {
        const wasUpdate = savedDefinitionId !== null;
        setSavedDefinitionId(result.id);
        addToast({ title: wasUpdate ? "Widget updated" : "Widget saved to your definitions" });
      }
      return result;
    },
    [addToast, savedDefinitionId, store],
  );
  // handleSaveDefinition resolves asynchronously (it writes widget.html/widget.json to OPFS
  // before committing the Definition); SaveWidgetDefinitionDialog awaits it. Re-saving the same
  // preview (savedDefinitionId already set) updates that Definition instead of creating a
  // duplicate — see saveChatWidgetDefinition's existingDefinitionId.

  return (
    <>
      <div {...stylex.props(styles.root)}>
        <div {...stylex.props(styles.header)}>
          <p {...stylex.props(styles.label)}>{getWidgetLabel(widget)}</p>
          {canSave && (
            <button
              type="button"
              onClick={() => setIsSaveDialogOpen(true)}
              {...stylex.props(styles.saveButton)}
            >
              <FloppyDiskIcon {...stylex.props(styles.saveIcon)} />
              {savedDefinitionId ? "Update" : "Save"}
            </button>
          )}
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
            srcDoc={iframeSrcDoc}
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
      <SaveWidgetDefinitionDialog
        open={isSaveDialogOpen}
        widgetCode={widget.widgetCode}
        widgetName={widget.title}
        defaultDataSourceName={widget.dataSourceName}
        defaultDataSourceParams={widget.dataSourceParams}
        dataFiles={widget.dataFiles}
        onOpenChange={setIsSaveDialogOpen}
        onSave={handleSaveDefinition}
      />
    </>
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
