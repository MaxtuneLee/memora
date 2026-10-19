import { useMemo, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useWidgetRuntime } from "@/components/chat/chatWidget/useWidgetRuntime";
import type { DataSourceValueState } from "@/hooks/widgets/useDataSourceValue";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import { parseShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

const REPORT_MESSAGE_TYPE = "memora-test:chat-bridge-report";

// The widget frame has an opaque origin, so the widget reports what it sees over postMessage
// instead of the test reaching into its document.
const WIDGET_CODE = `<div data-testid="value">pending</div><script>
let calls = 0;
const report = function () {
  window.parent.postMessage({
    type: "${REPORT_MESSAGE_TYPE}",
    text: document.querySelector('[data-testid="value"]').textContent,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    textColor: getComputedStyle(document.body).color,
  }, "*");
};
onData(function (data) {
  calls += 1;
  document.querySelector('[data-testid="value"]').textContent = "value:" + data + ":calls:" + calls;
  report();
});
new MutationObserver(report).observe(document.documentElement, { attributes: true });
report();
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
  const { sandbox } = useWidgetRuntime({ widget: WIDGET, parsedCode, dataState });

  return (
    <iframe
      key={sandbox.frameKey}
      ref={sandbox.iframeRef}
      title={WIDGET.title}
      src={sandbox.src}
      sandbox={sandbox.sandbox}
      style={{ height: sandbox.height, width: "100%" }}
    />
  );
}

interface BridgeReport {
  text: string;
  colorScheme: string;
  textColor: string;
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;
const reports: BridgeReport[] = [];
const collectReport = (event: MessageEvent) => {
  if (event.data?.type === REPORT_MESSAGE_TYPE) {
    const { text, colorScheme, textColor } = event.data;
    reports.push({ text, colorScheme, textColor });
  }
};

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
  reports.length = 0;
  window.removeEventListener("message", collectReport);
  delete document.documentElement.dataset.theme;
});

describe("Chat widget preview data bridge", () => {
  it("delivers catalog data through onData without re-running the script on updates", async () => {
    window.addEventListener("message", collectReport);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    root.render(<DataBridgeHarness dataState={null} />);
    await expect.poll(() => reports.at(-1)?.text, { timeout: 5000 }).toBe("pending");

    root.render(<DataBridgeHarness dataState={{ status: "loading" }} />);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(reports.at(-1)?.text).toBe("pending");

    root.render(<DataBridgeHarness dataState={{ status: "ready", value: 1 }} />);
    await expect.poll(() => reports.at(-1)?.text, { timeout: 5000 }).toBe("value:1:calls:1");

    root.render(<DataBridgeHarness dataState={{ status: "ready", value: 2 }} />);
    // "calls" only increments if the same onData listener fires again — a script re-run would
    // reset the closure's local `calls` back to 0 first.
    await expect.poll(() => reports.at(-1)?.text, { timeout: 5000 }).toBe("value:2:calls:2");
  });

  it("follows the resolved app theme without recreating the frame or rerunning the script", async () => {
    document.documentElement.dataset.theme = "dark";
    window.addEventListener("message", collectReport);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    root.render(<DataBridgeHarness dataState={{ status: "ready", value: 1 }} />);
    await expect
      .poll(() => reports.at(-1), { timeout: 5000 })
      .toEqual({ colorScheme: "dark", textColor: "rgb(236, 232, 223)", text: "value:1:calls:1" });
    const iframeElement = container.querySelector("iframe");

    document.documentElement.dataset.theme = "light";

    await expect
      .poll(() => reports.at(-1), { timeout: 5000 })
      .toEqual({ colorScheme: "light", textColor: "rgb(29, 28, 26)", text: "value:1:calls:1" });
    expect(container.querySelector("iframe")).toBe(iframeElement);
  });
});
