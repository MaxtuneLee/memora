import { useMemo, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useWidgetRuntime } from "@/components/chat/chatWidget/useWidgetRuntime";
import type { ChatWidget as ChatWidgetData, ChatWidgetPhase } from "@/lib/chat/showWidget";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

const REPORT_MESSAGE_TYPE = "memora-test:chat-rerun-report";

// Appends its cells instead of replacing them, like a 1,000-person grid built in a loop. The
// widget reports how many cells it has and how many times its script has run.
const WIDGET_CODE = `<div data-testid="grid"></div><script>
window.runs = (window.runs ?? 0) + 1;
const grid = document.querySelector('[data-testid="grid"]');
for (let i = 0; i < 5; i += 1) grid.append(document.createElement("span"));
window.parent.postMessage({
  type: "${REPORT_MESSAGE_TYPE}",
  cells: grid.querySelectorAll("span").length,
  runs: window.runs,
}, "*");
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
  const { sandbox } = useWidgetRuntime({ widget, parsedCode, onSendPrompt });

  return (
    <iframe
      key={sandbox.frameKey}
      ref={sandbox.iframeRef}
      title={widget.title}
      src={sandbox.src}
      sandbox={sandbox.sandbox}
      style={{ height: sandbox.height, width: "100%" }}
    />
  );
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;
const reports: Array<{ cells: number; runs: number }> = [];
const collectReport = (event: MessageEvent) => {
  if (event.data?.type === REPORT_MESSAGE_TYPE) {
    reports.push({ cells: event.data.cells, runs: event.data.runs });
  }
};

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
  reports.length = 0;
  window.removeEventListener("message", collectReport);
});

describe("Chat widget script runs", () => {
  it("runs once per widget code and never stacks an appending script's output", async () => {
    window.addEventListener("message", collectReport);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    root.render(<RerunHarness phase="streaming" onSendPrompt={() => {}} />);
    await expect.poll(() => reports.at(-1), { timeout: 5000 }).toEqual({ cells: 5, runs: 1 });

    // The phase settles and the parent passes a new callback on every render, as the chat does.
    root.render(<RerunHarness phase="ready" onSendPrompt={() => {}} />);
    root.render(<RerunHarness phase="ready" onSendPrompt={() => {}} />);
    await new Promise((resolve) => window.setTimeout(resolve, 200));

    expect(reports).toEqual([{ cells: 5, runs: 1 }]);
  });
});
