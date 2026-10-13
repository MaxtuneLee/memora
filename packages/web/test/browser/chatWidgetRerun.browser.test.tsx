import { useMemo, useState, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { buildWidgetIframeSrcDoc } from "@/components/chat/chatWidget/constants";
import { useWidgetIframe } from "@/components/chat/chatWidget/useWidgetIframe";
import { useWidgetRuntime } from "@/components/chat/chatWidget/useWidgetRuntime";
import { useResolvedTheme } from "@/hooks/theme/useResolvedTheme";
import type { ChatWidget as ChatWidgetData, ChatWidgetPhase } from "@/lib/chat/showWidget";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

// Appends its cells instead of replacing them, like a 1,000-person grid built in a loop.
const WIDGET_CODE = `<div data-testid="grid"></div><script>
window.runs = (window.runs ?? 0) + 1;
const grid = document.querySelector('[data-testid="grid"]');
for (let i = 0; i < 5; i += 1) grid.append(document.createElement("span"));
</script>`;

function RerunHarness({
  phase,
  onSendPrompt,
}: {
  phase: ChatWidgetPhase;
  onSendPrompt: (text: string) => void;
}): JSX.Element {
  const widget: ChatWidgetData = {
    toolCallId: "call-1",
    title: "Rerun test widget",
    loadingMessages: [],
    widgetCode: WIDGET_CODE,
    phase,
  };
  const parsedCode = useMemo(() => parseShowWidgetCode(WIDGET_CODE), []);
  const resolvedTheme = useResolvedTheme();
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
  useWidgetRuntime({
    widget,
    parsedCode,
    iframeReady,
    iframeDocumentRef,
    userStyleRef,
    contentRef,
    hasRuntimeDom,
    syncIframeHeight,
    onSendPrompt,
  });

  return (
    <iframe
      ref={iframeRef}
      title={widget.title}
      srcDoc={iframeSrcDoc}
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
});

describe("Chat widget script runs", () => {
  it("runs once per widget code and never stacks an appending script's output", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    root.render(<RerunHarness phase="streaming" onSendPrompt={() => {}} />);
    await expect
      .poll(() => Boolean(container?.querySelector("iframe")), { timeout: 5000 })
      .toBe(true);
    const iframeElement = container.querySelector("iframe");
    if (!iframeElement) {
      throw new Error("Expected the widget to render an iframe.");
    }
    const read = () => ({
      cells: iframeElement.contentDocument?.querySelectorAll('[data-testid="grid"] span').length,
      runs: (iframeElement.contentWindow as (Window & { runs?: number }) | null)?.runs,
    });

    await expect.poll(read, { timeout: 5000 }).toEqual({ cells: 5, runs: 1 });

    // The phase settles and the parent passes a new callback on every render, as the chat does.
    root.render(<RerunHarness phase="ready" onSendPrompt={() => {}} />);
    root.render(<RerunHarness phase="ready" onSendPrompt={() => {}} />);
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    expect(read()).toEqual({ cells: 5, runs: 1 });
  });
});
