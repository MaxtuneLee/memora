import { type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { GeneratedWidgetFrame } from "@/components/dashboard/homeGrid/GeneratedWidgetFrame";

const PROBE_MESSAGE_TYPE = "memora-test:sandbox-probe";

interface ProbeReport {
  cookieSeen: string;
  parentAccessBlocked: boolean;
  fetchBlocked: boolean;
  renderedValue: string;
}

// Playwright/CDP cannot introspect the content of a sandbox="allow-scripts" (no
// allow-same-origin) iframe from outside — confirmed against a minimal repro before writing
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

      expect(iframeElement.getAttribute("sandbox")).toBe("allow-scripts");

      await expect.poll(() => reports.length).toBeGreaterThan(0);
      const firstReport = reports[0];
      expect(firstReport).toMatchObject({
        parentAccessBlocked: true,
        fetchBlocked: true,
        renderedValue: "value:1",
      });
      expect(firstReport?.cookieSeen).not.toContain("memora_outer_probe");
      expect(document.cookie).not.toContain("memora_sandbox_probe");

      root.render(<SandboxHarness widgetCode={widgetCode} data={{ value: 2 }} />);

      await expect.poll(() => reports.at(-1)?.renderedValue).toBe("value:2");
    } finally {
      window.removeEventListener("message", handleMessage);
    }
  });
});
