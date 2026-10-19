import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  WIDGET_FAILURE_COPY,
  useWidgetSandbox,
  type WidgetSandbox,
} from "@/hooks/widgets/useWidgetSandbox";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";
import { buildRunSignature, buildWidgetScripts } from "@/lib/widgets/sandbox/payload";
import { HOST_MESSAGE } from "@/lib/widgets/sandbox/protocol";
import type { WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";

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
  retryButton: {
    backgroundColor: "transparent",
    border: `1px solid ${tokens.warningBorder}`,
    borderRadius: 8,
    color: "inherit",
    cursor: "pointer",
    font: "inherit",
    marginTop: 8,
    paddingBlock: 4,
    paddingInline: 12,
  },
  error: {
    alignItems: "center",
    backgroundColor: tokens.warningSurface,
    border: `1px solid ${tokens.warningBorder}`,
    borderRadius: 16,
    color: tokens.warningText,
    display: "flex",
    flexDirection: "column",
    fontSize: 14,
    justifyContent: "center",
    lineHeight: 1.5,
    minHeight: 128,
    padding: 16,
    textAlign: "center",
  },
});

// Sends the widget's code, data and run signature to the runner once it has booted, and again
// whenever they change.
function useWidgetCodeSync({
  sandbox,
  widgetCode,
  data,
  dataReady,
  onCodeChange,
}: {
  sandbox: WidgetSandbox;
  widgetCode: string;
  data: unknown;
  dataReady: boolean;
  onCodeChange: () => void;
}): void {
  const { booted, post } = sandbox;
  const parsed = useMemo(() => parseShowWidgetCode(widgetCode), [widgetCode]);
  const scripts = useMemo(() => buildWidgetScripts(parsed), [parsed]);
  const signature = useMemo(() => buildRunSignature(parsed), [parsed]);

  // A runner error belongs to the code that produced it; new code gets a fresh chance.
  useEffect(() => {
    onCodeChange();
  }, [onCodeChange, signature]);

  useEffect(() => {
    if (!booted) {
      return;
    }
    post({ type: HOST_MESSAGE.render, style: parsed.styleText, html: parsed.htmlRenderable });
    post({ type: HOST_MESSAGE.run, signature, scripts });
  }, [booted, post, parsed, scripts, signature]);

  useEffect(() => {
    if (!booted || !dataReady) {
      return;
    }
    post({ type: HOST_MESSAGE.data, payload: data });
  }, [booted, dataReady, data, post]);
}

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
  const [hasRuntimeError, setHasRuntimeError] = useState(false);
  const sandbox = useWidgetSandbox({
    onSendPrompt,
    onOpenLink,
    onWriteData,
    onRunnerError: () => setHasRuntimeError(true),
  });
  const clearRuntimeError = useCallback(() => setHasRuntimeError(false), []);
  useWidgetCodeSync({ sandbox, widgetCode, data, dataReady, onCodeChange: clearRuntimeError });
  const isVisible = sandbox.ready && dataReady;

  if (sandbox.failure) {
    return (
      <div role="alert" {...stylex.props(styles.error)}>
        {WIDGET_FAILURE_COPY[sandbox.failure]}
        <button type="button" onClick={sandbox.restart} {...stylex.props(styles.retryButton)}>
          Reload widget
        </button>
      </div>
    );
  }

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
        key={sandbox.frameKey}
        ref={sandbox.iframeRef}
        title={title}
        src={sandbox.src}
        sandbox={sandbox.sandbox}
        referrerPolicy="no-referrer"
        aria-hidden={!isVisible}
        {...stylex.props(styles.iframe, isVisible ? styles.iframeReady : styles.iframeLoading)}
        style={{ height: sandbox.height }}
      />
    </div>
  );
}
