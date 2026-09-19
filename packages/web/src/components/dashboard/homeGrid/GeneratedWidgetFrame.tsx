import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";

import {
  GENERATED_WIDGET_DATA_MESSAGE,
  GENERATED_WIDGET_OPEN_LINK_MESSAGE,
  GENERATED_WIDGET_READY_MESSAGE,
  GENERATED_WIDGET_RESIZE_MESSAGE,
  GENERATED_WIDGET_SEND_PROMPT_MESSAGE,
  buildGeneratedWidgetSrcDoc,
} from "@/lib/widgets/generatedWidgetRuntime";

export function GeneratedWidgetFrame({
  widgetCode,
  data,
  dataReady = true,
  title,
  onSendPrompt,
  onOpenLink,
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
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSendPrompt, onOpenLink]);

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
