import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GeneratedWidgetFrame } from "@/components/dashboard/homeGrid/GeneratedWidgetFrame";

const WIDGET_CODE = '<div style="height: 300px">Tall widget</div>';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

const mount = (): void => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => {
    root?.render(<GeneratedWidgetFrame widgetCode={WIDGET_CODE} data={null} title="Tall widget" />);
  });
};

const unmount = (): void => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(unmount);

describe("Widget frame height", () => {
  it("starts small the first time, then reserves its last height on the next load", async () => {
    mount();
    // Nothing is known about this widget yet, so the frame starts at one pixel.
    expect(container?.querySelector("iframe")?.style.height).toBe("1px");
    await expect
      .poll(() => container?.querySelector("iframe")?.style.height, { timeout: 8000 })
      .toBe("300px");
    // The measured height is saved once the widget is ready.
    await expect
      .poll(() => window.localStorage.getItem("memora:widget-heights"), { timeout: 8000 })
      .toContain("300");
    unmount();

    mount();
    // Read in the same tick as the render, before the runner can have answered.
    expect(container?.querySelector("iframe")?.style.height).toBe("300px");
  });
});
