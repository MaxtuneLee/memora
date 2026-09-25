import { type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { GeneratedWidgetFrame } from "@/components/dashboard/homeGrid/GeneratedWidgetFrame";
import { GENERATED_WIDGET_ERROR_MESSAGE } from "@/lib/widgets/generatedWidgetRuntime";

const PROBE_MESSAGE_TYPE = "memora-test:sandbox-probe";

interface ProbeReport {
  cookieSeen: string;
  parentAccessBlocked: boolean;
  fetchBlocked: boolean;
  renderedValue: string;
}

// Playwright/CDP cannot introspect the content of a sandboxed iframe without allow-same-origin
// from outside — confirmed against a minimal repro before writing
// this test. So instead of reaching into the frame with a locator, the widget script itself
// reports what it can (and can't) see back over the very postMessage channel the sandbox is
// supposed to be limited to, and the outer test asserts on that report.
const buildProbeWidgetCode = (probeOrigin: string): string => `
<div data-testid="value">waiting</div>
<script>
(function () {
  var cookieSeen = "";
  try {
    document.cookie = "memora_sandbox_probe=should-not-be-visible-to-app";
    cookieSeen = document.cookie;
  } catch (error) {
    cookieSeen = "<threw>";
  }

  var parentAccessBlocked = false;
  try {
    void window.parent.document;
  } catch (error) {
    parentAccessBlocked = true;
  }

  fetch("${probeOrigin}/", { mode: "cors", credentials: "include" })
    .catch(function () {
      return "blocked";
    })
    .then(function (result) {
      var fetchBlocked = result === "blocked";
      MEMORA_HOME_WIDGET.onData(function (data) {
        var valueEl = document.querySelector('[data-testid="value"]');
        valueEl.textContent = "value:" + data.value;
        window.parent.postMessage(
          {
            type: "${PROBE_MESSAGE_TYPE}",
            cookieSeen: cookieSeen,
            parentAccessBlocked: parentAccessBlocked,
            fetchBlocked: fetchBlocked,
            renderedValue: valueEl.textContent,
          },
          "*",
        );
      });
    });
})();
</script>
`;

function SandboxHarness({ widgetCode, data }: { widgetCode: string; data: unknown }): JSX.Element {
  return <GeneratedWidgetFrame widgetCode={widgetCode} data={data} title="Sandbox test widget" />;
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
  document.cookie = "memora_outer_probe=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("Generated Home Grid widget sandbox", () => {
  it("keeps the animated loading state visible until the frame and its data are ready", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    root.render(
      <GeneratedWidgetFrame
        widgetCode="<div>Ready widget</div>"
        data={{}}
        dataReady={false}
        title="Loading widget"
      />,
    );

    await expect
      .poll(() => container?.querySelector('[role="status"]')?.textContent)
      .toBe("Loading widget…");

    root.render(
      <GeneratedWidgetFrame
        widgetCode="<div>Ready widget</div>"
        data={{}}
        dataReady
        title="Loading widget"
      />,
    );

    // The overlay clears on the frame's ready handshake, which a srcDoc iframe lands just either
    // side of poll's 1s default — give it room rather than letting the boundary decide.
    await expect
      .poll(() => container?.querySelector('[role="status"]'), { timeout: 8000 })
      .toBeNull();
  });

  it("contains a widget runtime error in its own visible error state", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    root.render(
      <div>
        <GeneratedWidgetFrame
          widgetCode="<div>Broken widget</div>"
          data={{}}
          title="Broken widget"
        />
        <p>Healthy sibling</p>
      </div>,
    );

    await expect.poll(() => Boolean(container?.querySelector("iframe"))).toBe(true);
    const iframeWindow = container?.querySelector("iframe")?.contentWindow;
    if (!iframeWindow) {
      throw new Error("Expected the generated widget iframe to have a content window.");
    }
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: GENERATED_WIDGET_ERROR_MESSAGE },
        source: iframeWindow,
      }),
    );

    await expect
      .poll(() => container?.querySelector('[role="alert"]')?.textContent, { timeout: 5_000 })
      .toBe("This widget couldn’t be displayed.");
    expect(container?.textContent).toContain("Healthy sibling");
  });

  it("cannot reach same-origin cookies, the parent window, or app-origin network, and renders live data over the message channel", async () => {
    document.cookie = "memora_outer_probe=outer-secret";
    const widgetCode = buildProbeWidgetCode(window.location.origin);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    const reports: ProbeReport[] = [];
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === PROBE_MESSAGE_TYPE) {
        reports.push(event.data);
      }
    };
    window.addEventListener("message", handleMessage);

    try {
      root.render(<SandboxHarness widgetCode={widgetCode} data={{ value: 1 }} />);

      await expect.poll(() => Boolean(container?.querySelector("iframe"))).toBe(true);
      const iframeElement = container.querySelector("iframe");
      if (!iframeElement) {
        throw new Error("Expected the generated widget to render an iframe.");
      }

      expect(iframeElement.getAttribute("sandbox")).toBe("allow-scripts allow-forms");

      await expect.poll(() => reports.length, { timeout: 5_000 }).toBeGreaterThan(0);
      const firstReport = reports[0];
      expect(firstReport).toMatchObject({
        parentAccessBlocked: true,
        fetchBlocked: true,
        renderedValue: "value:1",
      });
      expect(firstReport?.cookieSeen).not.toContain("memora_outer_probe");
      expect(document.cookie).not.toContain("memora_sandbox_probe");

      root.render(<SandboxHarness widgetCode={widgetCode} data={{ value: 2 }} />);

      await expect.poll(() => reports.at(-1)?.renderedValue, { timeout: 5_000 }).toBe("value:2");
    } finally {
      window.removeEventListener("message", handleMessage);
    }
  });
});
