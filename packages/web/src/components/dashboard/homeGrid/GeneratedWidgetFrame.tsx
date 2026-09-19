import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";

import {
  GENERATED_WIDGET_DATA_MESSAGE,
  GENERATED_WIDGET_OPEN_LINK_MESSAGE,
  GENERATED_WIDGET_READY_MESSAGE,
  GENERATED_WIDGET_RESIZE_MESSAGE,
  GENERATED_WIDGET_SEND_PROMPT_MESSAGE,
  GENERATED_WIDGET_WRITE_DATA_MESSAGE,
  GENERATED_WIDGET_WRITE_DATA_RESULT_MESSAGE,
  buildGeneratedWidgetSrcDoc,
} from "@/lib/widgets/generatedWidgetRuntime";
import type { WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";

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
  const srcDoc = useMemo(() => buildGeneratedWidgetSrcDoc(widgetCode), [widgetCode]);

  useEffect(() => {
    setReady(false);
  }, [srcDoc]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data?.type === GENERATED_WIDGET_READY_MESSAGE) {
        setReady(true);
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

  return (
    <iframe
      ref={iframeRef}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ border: "none", display: "block", height, width: "100%" }}
    />
  );
}
