import { useMemo, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { WIDGET_IFRAME_SRC_DOC } from "@/components/chat/chatWidget/constants";
import { useWidgetIframe } from "@/components/chat/chatWidget/useWidgetIframe";
import { useWidgetRuntime } from "@/components/chat/chatWidget/useWidgetRuntime";
import type { DataSourceValueState } from "@/hooks/widgets/useDataSourceValue";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

const WIDGET_CODE = `<div data-testid="value">pending</div><script>
let calls = 0;
onData(function (data) {
  calls += 1;
  document.querySelector('[data-testid="value"]').textContent = "value:" + data + ":calls:" + calls;
});
</script>`;

const WIDGET: ChatWidgetData = {
  toolCallId: "call-1",
  title: "Data bridge test widget",
  loadingMessages: [],
  widgetCode: WIDGET_CODE,
  phase: "ready",
};

function DataBridgeHarness({ dataState }: { dataState: DataSourceValueState | null }): JSX.Element {
  const parsedCode = useMemo(() => parseShowWidgetCode(WIDGET.widgetCode), []);
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
  useWidgetRuntime({
    widget: WIDGET,
    parsedCode,
    iframeReady,
    iframeDocumentRef,
    userStyleRef,
    contentRef,
    hasRuntimeDom,
    syncIframeHeight,
    dataState,
  });

  return (
    <iframe
      ref={iframeRef}
      title={WIDGET.title}
      srcDoc={WIDGET_IFRAME_SRC_DOC}
      style={{ height: iframeHeight, width: "100%" }}
      onLoad={bindIframeDocument}
    />
  );
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
  delete document.documentElement.dataset.theme;
});

describe("Chat widget preview data bridge", () => {
  it("delivers catalog data through onData without re-running the script on updates", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    root.render(<DataBridgeHarness dataState={null} />);
    await expect
      .poll(() => Boolean(container?.querySelector("iframe")), { timeout: 5000 })
      .toBe(true);
    const iframeElement = container.querySelector("iframe");
    if (!iframeElement) {
      throw new Error("Expected the widget preview to render an iframe.");
    }
    const getValueText = () =>
      iframeElement.contentDocument?.querySelector('[data-testid="value"]')?.textContent ?? null;

    await expect.poll(getValueText, { timeout: 5000 }).toBe("pending");

    root.render(<DataBridgeHarness dataState={{ status: "loading" }} />);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(getValueText()).toBe("pending");

    root.render(<DataBridgeHarness dataState={{ status: "ready", value: 1 }} />);
    await expect.poll(getValueText, { timeout: 5000 }).toBe("value:1:calls:1");

    root.render(<DataBridgeHarness dataState={{ status: "ready", value: 2 }} />);
    // "calls" only increments if the same onData listener fires again — a script re-run would
    // reset the closure's local `calls` back to 0 first.
    await expect.poll(getValueText, { timeout: 5000 }).toBe("value:2:calls:2");
  });

  it("follows the resolved app theme without recreating the frame or rerunning the script", async () => {
    document.documentElement.dataset.theme = "dark";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    root.render(<DataBridgeHarness dataState={{ status: "ready", value: 1 }} />);
    await expect
      .poll(() => Boolean(container?.querySelector("iframe")), { timeout: 5000 })
      .toBe(true);
    const iframeElement = container.querySelector("iframe");
    if (!iframeElement) {
      throw new Error("Expected the widget preview to render an iframe.");
    }
    const readTheme = () => {
      const iframeDocument = iframeElement.contentDocument;
      if (!iframeDocument?.body) {
        return null;
      }
      const view = iframeDocument.defaultView;
      return {
        colorScheme: view?.getComputedStyle(iframeDocument.documentElement).colorScheme,
        textColor: view?.getComputedStyle(iframeDocument.body).color,
        value: iframeDocument.querySelector('[data-testid="value"]')?.textContent,
      };
    };

    await expect
      .poll(readTheme, { timeout: 5000 })
      .toEqual({ colorScheme: "dark", textColor: "rgb(236, 232, 223)", value: "value:1:calls:1" });
    const valueNode = iframeElement.contentDocument?.querySelector('[data-testid="value"]');

    document.documentElement.dataset.theme = "light";

    await expect
      .poll(readTheme, { timeout: 5000 })
      .toEqual({ colorScheme: "light", textColor: "rgb(29, 28, 26)", value: "value:1:calls:1" });
    expect(container.querySelector("iframe")).toBe(iframeElement);
    expect(iframeElement.contentDocument?.querySelector('[data-testid="value"]')).toBe(valueNode);
  });
});
