import type { JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { GeneratedWidgetFrame } from "@/components/dashboard/homeGrid/GeneratedWidgetFrame";

// Bare identifiers, not MEMORA_HOME_WIDGET.sendPrompt(...) — this is the calling convention the
// show-widget-skills docs teach and Chat's runtime implements; a widget saved from Chat must work
// here unchanged.
const WIDGET_CODE = `<div>widget</div><script>
sendPrompt("summarize my recent files");
openLink("https://example.com/report");
</script>`;

function ActionsHarness({
  onSendPrompt,
  onOpenLink,
}: {
  onSendPrompt: (text: string) => void;
  onOpenLink: (url: string) => void;
}): JSX.Element {
  return (
    <GeneratedWidgetFrame
      widgetCode={WIDGET_CODE}
      data={null}
      title="Actions test widget"
      onSendPrompt={onSendPrompt}
      onOpenLink={onOpenLink}
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

describe("Generated Home Grid widget postMessage actions", () => {
  it("routes sendPrompt and openLink calls to the host through postMessage, not a direct call", async () => {
    const sentPrompts: string[] = [];
    const openedLinks: string[] = [];

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <ActionsHarness
        onSendPrompt={(text) => sentPrompts.push(text)}
        onOpenLink={(url) => openedLinks.push(url)}
      />,
    );

    await expect.poll(() => Boolean(container?.querySelector("iframe"))).toBe(true);
    await expect.poll(() => sentPrompts, { timeout: 5000 }).toEqual(["summarize my recent files"]);
    await expect.poll(() => openedLinks, { timeout: 5000 }).toEqual(["https://example.com/report"]);
  });

  it("ignores an empty sendPrompt/openLink call instead of forwarding a blank action", async () => {
    const sentPrompts: string[] = [];
    const openedLinks: string[] = [];

    function EmptyActionsHarness(): JSX.Element {
      return (
        <GeneratedWidgetFrame
          widgetCode={`<div>widget</div><script>
MEMORA_HOME_WIDGET.sendPrompt("   ");
MEMORA_HOME_WIDGET.openLink("");
MEMORA_HOME_WIDGET.sendPrompt("real prompt");
</script>`}
          data={null}
          title="Empty actions test widget"
          onSendPrompt={(text) => sentPrompts.push(text)}
          onOpenLink={(url) => openedLinks.push(url)}
        />
      );
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<EmptyActionsHarness />);

    await expect.poll(() => sentPrompts).toEqual(["real prompt"]);
    expect(openedLinks).toEqual([]);
  });

  it("exposes container, getData, and onData as bare identifiers too, matching Chat's runtime", async () => {
    // The iframe has no allow-same-origin permission (opaque origin), so
    // contentDocument is inaccessible from outside — same constraint documented in
    // generatedWidgetSandbox.browser.test.tsx. The widget reports what it saw over postMessage
    // instead of the outer test reaching in.
    const REPORT_MESSAGE_TYPE = "memora-test:bare-bindings-report";
    const widgetCode = `<script>
onData(function (data) {
  window.parent.postMessage(
    {
      type: "${REPORT_MESSAGE_TYPE}",
      containerIsWidgetRoot: container === document.getElementById("widget-root"),
      onDataValue: data,
      getDataValue: getData(),
    },
    "*",
  );
});
</script>`;

    function BareBindingsHarness(): JSX.Element {
      return (
        <GeneratedWidgetFrame widgetCode={widgetCode} data={42} title="Bare bindings test widget" />
      );
    }

    const reports: Array<{
      containerIsWidgetRoot: boolean;
      onDataValue: unknown;
      getDataValue: unknown;
    }> = [];
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === REPORT_MESSAGE_TYPE) {
        reports.push(event.data);
      }
    };
    window.addEventListener("message", handleMessage);

    try {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      root.render(<BareBindingsHarness />);

      await expect.poll(() => reports.length, { timeout: 5000 }).toBeGreaterThan(0);
      expect(reports[0]).toMatchObject({
        containerIsWidgetRoot: true,
        onDataValue: 42,
        getDataValue: 42,
      });
    } finally {
      window.removeEventListener("message", handleMessage);
    }
  });
});
