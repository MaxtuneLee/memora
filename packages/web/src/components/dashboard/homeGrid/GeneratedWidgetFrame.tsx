import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";

import {
  GENERATED_WIDGET_DATA_MESSAGE,
  GENERATED_WIDGET_READY_MESSAGE,
  GENERATED_WIDGET_RESIZE_MESSAGE,
  buildGeneratedWidgetSrcDoc,
} from "@/lib/widgets/generatedWidgetRuntime";

export function GeneratedWidgetFrame({
  widgetCode,
  data,
  title,
}: {
  widgetCode: string;
  data: unknown;
  title: string;
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
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    iframeRef.current?.contentWindow?.postMessage(
      { type: GENERATED_WIDGET_DATA_MESSAGE, payload: data },
      "*",
    );
  }, [ready, data]);

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
