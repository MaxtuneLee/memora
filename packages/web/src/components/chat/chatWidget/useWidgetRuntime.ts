import { useCallback, useEffect, useRef, useState } from "react";

import { useWidgetSandbox, type WidgetSandbox } from "@/hooks/widgets/useWidgetSandbox";
import type { DataSourceValueState } from "@/hooks/widgets/useDataSourceValue";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import { updateShowWidgetDebug } from "@/lib/chat/showWidgetDebug";
import type { ParsedShowWidgetCode } from "@/lib/chat/showWidgetRuntime";
import { normalizeWidgetLink } from "@/lib/widgets/sandbox/limits";
import { buildRunSignature, buildWidgetScripts } from "@/lib/widgets/sandbox/payload";
import { HOST_MESSAGE } from "@/lib/widgets/sandbox/protocol";
import type { WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";

// The sandbox host already filters links; this keeps the check next to the call that opens one.
const openLink = (url: string): void => {
  const safeUrl = normalizeWidgetLink(url);
  if (safeUrl) {
    // fallow-ignore-next-line security-sink -- safeUrl is an http(s) URL from normalizeWidgetLink, never a javascript: or data: URL.
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }
};

// Streams a Chat widget into the sandboxed runner (ADR 0011): style and markup go over as they
// arrive, and the script runs once, when its closing tag has streamed and its code changes.
export const useWidgetRuntime = ({
  widget,
  parsedCode,
  onSendPrompt,
  dataState,
  onWriteData,
}: {
  widget: ChatWidgetData;
  parsedCode: ParsedShowWidgetCode;
  onSendPrompt?: (text: string) => Promise<void> | void;
  // The widget's bound catalog data (from show_widget's data_source/data_source_params), or null
  // when it has no binding. It reaches the runner as a message, so an update never re-runs the
  // widget script — only its onData listeners are notified.
  dataState?: DataSourceValueState | null;
  // Host-mediated write channel (ADR 0008); preview keeps writes in memory (see
  // usePreviewWidgetData). Omitting this refuses every write.
  onWriteData?: (name: string, content: string) => Promise<WriteWidgetDataResult>;
}): {
  sandbox: WidgetSandbox;
  runtimeError: { signature: string; message: string } | null;
} => {
  const [runtimeError, setRuntimeError] = useState<{
    signature: string;
    message: string;
  } | null>(null);
  const executedSignatureRef = useRef("");
  const signature = buildRunSignature(parsedCode);
  const toolCallId = widget.toolCallId;
  const phase = widget.phase;

  const handleRunnerError = useCallback(
    (message: { kind: "script" | "listener"; signature: string | null; message: string }) => {
      if (message.kind === "listener") {
        return;
      }
      const errorSignature = message.signature ?? "";
      updateShowWidgetDebug(
        toolCallId,
        { phase: "error" },
        {
          type: "widget-script-error",
          summary: "Widget script threw during execution",
          details: { message: message.message },
        },
      );
      setRuntimeError({ signature: errorSignature, message: message.message });
    },
    [toolCallId],
  );

  const handleRunResult = useCallback(
    (message: { scriptCount: number; hasCleanup: boolean }) => {
      updateShowWidgetDebug(
        toolCallId,
        { phase },
        {
          type: "widget-script-success",
          summary: "Widget script executed",
          details: { returnedCleanup: message.hasCleanup, scriptCount: message.scriptCount },
        },
      );
    },
    [phase, toolCallId],
  );

  const sandbox = useWidgetSandbox({
    onSendPrompt,
    onOpenLink: openLink,
    onWriteData,
    onRunnerError: handleRunnerError,
    onRunResult: handleRunResult,
  });
  const { booted, post } = sandbox;

  useEffect(() => {
    if (!booted) {
      // A restarted frame starts empty, so the script has to run again.
      executedSignatureRef.current = "";
      return;
    }
    post({
      type: HOST_MESSAGE.render,
      style: parsedCode.styleText,
      html: parsedCode.htmlRenderable,
    });
  }, [booted, parsedCode.htmlRenderable, parsedCode.styleText, post]);

  useEffect(() => {
    if (!booted) {
      return;
    }
    const canRun =
      phase !== "error" &&
      parsedCode.hasScript &&
      parsedCode.scriptReady &&
      parsedCode.scriptText.trim().length > 0;
    if (!canRun) {
      if (executedSignatureRef.current) {
        executedSignatureRef.current = "";
        post({ type: HOST_MESSAGE.teardown });
      }
      return;
    }
    if (executedSignatureRef.current === signature) {
      return;
    }

    executedSignatureRef.current = signature;
    updateShowWidgetDebug(
      toolCallId,
      { phase },
      {
        type: "widget-script-start",
        summary: "Executing widget script",
        details: {
          htmlRenderableLength: parsedCode.htmlRenderable.length,
          scriptLength: parsedCode.scriptText.length,
        },
      },
    );
    setRuntimeError((current) => (current?.signature === signature ? null : current));
    // No teardown on a phase or prop change: it must not re-run the script. A code change posts
    // a new run, which tears the previous one down inside the runner.
    post({ type: HOST_MESSAGE.run, signature, scripts: buildWidgetScripts(parsedCode) });
  }, [booted, parsedCode, phase, post, signature, toolCallId]);

  useEffect(() => {
    if (!booted || dataState?.status !== "ready") {
      return;
    }
    post({ type: HOST_MESSAGE.data, payload: dataState.value });
  }, [booted, dataState, post]);

  return { sandbox, runtimeError };
};
