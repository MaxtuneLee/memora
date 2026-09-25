import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  GENERATED_WIDGET_DATA_MESSAGE,
  GENERATED_WIDGET_ERROR_MESSAGE,
  GENERATED_WIDGET_OPEN_LINK_MESSAGE,
  GENERATED_WIDGET_READY_MESSAGE,
  GENERATED_WIDGET_RESIZE_MESSAGE,
  GENERATED_WIDGET_SEND_PROMPT_MESSAGE,
  GENERATED_WIDGET_THEME_MESSAGE,
  GENERATED_WIDGET_WRITE_DATA_MESSAGE,
  GENERATED_WIDGET_WRITE_DATA_RESULT_MESSAGE,
  buildGeneratedWidgetSrcDoc,
} from "@/lib/widgets/generatedWidgetRuntime";
import type { WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";
import { useResolvedTheme } from "@/hooks/theme/useResolvedTheme";

import { GeneratedWidgetLoadingState } from "./GeneratedWidgetLoadingState";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  frame: { minHeight: 128, position: "relative" },
  loading: { inset: 0, position: "absolute", zIndex: 1 },
  iframe: {
    border: "none",
    display: "block",
    opacity: 0,
    transition: "opacity 180ms cubic-bezier(0.23, 1, 0.32, 1)",
    width: "100%",
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "120ms" },
  },
  iframeReady: { opacity: 1 },
  iframeLoading: { pointerEvents: "none" },
  error: {
    alignItems: "center",
    backgroundColor: tokens.warningSurface,
    border: `1px solid ${tokens.warningBorder}`,
    borderRadius: 16,
    color: tokens.warningText,
    display: "flex",
    fontSize: 14,
    justifyContent: "center",
    lineHeight: 1.5,
    minHeight: 128,
    padding: 16,
    textAlign: "center",
  },
});

export function GeneratedWidgetFrame({
  widgetCode,
  data,
  dataReady = true,
  title,
  onSendPrompt,
  onOpenLink,
  onWriteData,
}: {
  widgetCode: string;
  data: unknown;
  // Defaults to true so callers that already have a resolved value (e.g. tests) don't need to
  // thread a loading flag through — GeneratedWidgetTile passes it explicitly once data is ready.
  dataReady?: boolean;
  title: string;
  // The sandboxed widget can only reach these through postMessage (see ADR 0006) — the host
  // decides what "send to chat" and "open this link" actually do.
  onSendPrompt?: (text: string) => void;
  onOpenLink?: (url: string) => void;
  // Host-mediated write channel (ADR 0008): the host decides which Definition's data/ folder
  // (if any) this widget instance may write into. Omitting this prop refuses every write.
  onWriteData?: (name: string, content: string) => Promise<WriteWidgetDataResult>;
}): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(1);
  const [hasRuntimeError, setHasRuntimeError] = useState(false);
  const theme = useResolvedTheme();
  // Only the first theme goes into the srcDoc: later changes arrive as messages, so switching
  // themes never reloads the frame or reruns the widget script.
  const [initialTheme] = useState(theme);
  const srcDoc = useMemo(
    () => buildGeneratedWidgetSrcDoc(widgetCode, initialTheme),
    [widgetCode, initialTheme],
  );
  const isVisible = ready && dataReady;

  useEffect(() => {
    setReady(false);
    setHasRuntimeError(false);
  }, [srcDoc]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data?.type === GENERATED_WIDGET_READY_MESSAGE) {
        setReady(true);
      } else if (event.data?.type === GENERATED_WIDGET_ERROR_MESSAGE) {
        setHasRuntimeError(true);
      } else if (event.data?.type === GENERATED_WIDGET_RESIZE_MESSAGE) {
        const nextHeight = Number(event.data.height);
        setHeight(Number.isFinite(nextHeight) && nextHeight > 0 ? nextHeight : 1);
      } else if (event.data?.type === GENERATED_WIDGET_SEND_PROMPT_MESSAGE) {
        const text = event.data.text;
        if (typeof text === "string" && text.trim()) {
          onSendPrompt?.(text);
        }
      } else if (event.data?.type === GENERATED_WIDGET_OPEN_LINK_MESSAGE) {
        const url = event.data.url;
        if (typeof url === "string" && url.trim()) {
          onOpenLink?.(url);
        }
      } else if (event.data?.type === GENERATED_WIDGET_WRITE_DATA_MESSAGE) {
        const { requestId, name, content } = event.data;
        if (typeof requestId !== "string") {
          return;
        }
        const respond = (result: WriteWidgetDataResult) => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: GENERATED_WIDGET_WRITE_DATA_RESULT_MESSAGE, requestId, ...result },
            "*",
          );
        };
        if (!onWriteData) {
          respond({ ok: false, error: "This widget cannot write data." });
          return;
        }
        onWriteData(String(name ?? ""), String(content ?? ""))
          .then(respond)
          .catch((error: unknown) => {
            respond({ ok: false, error: error instanceof Error ? error.message : "Write failed." });
          });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSendPrompt, onOpenLink, onWriteData]);

  useEffect(() => {
    if (!ready || !dataReady) {
      return;
    }

    iframeRef.current?.contentWindow?.postMessage(
      { type: GENERATED_WIDGET_DATA_MESSAGE, payload: data },
      "*",
    );
  }, [ready, dataReady, data]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    iframeRef.current?.contentWindow?.postMessage(
      { type: GENERATED_WIDGET_THEME_MESSAGE, theme },
      "*",
    );
  }, [ready, theme]);

  if (hasRuntimeError) {
    return (
      <div role="alert" {...stylex.props(styles.error)}>
        This widget couldn’t be displayed.
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.frame)}>
      {!isVisible && (
        <div {...stylex.props(styles.loading)}>
          <GeneratedWidgetLoadingState />
        </div>
      )}
      <iframe
        ref={iframeRef}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-forms"
        aria-hidden={!isVisible}
        {...stylex.props(styles.iframe, isVisible ? styles.iframeReady : styles.iframeLoading)}
        style={{ height }}
      />
    </div>
  );
}
