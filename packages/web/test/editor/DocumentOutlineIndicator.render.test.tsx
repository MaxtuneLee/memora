import { cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { beforeEach, expect, test, vi } from "vite-plus/test";

import {
  DocumentOutlineIndicator,
  type MarkdownHeading,
} from "@/components/editor/DocumentOutlineIndicator";

const headings: readonly MarkdownHeading[] = [
  {
    id: "heading-1-0",
    index: 0,
    level: 1,
    line: 1,
    position: 0,
    title: "Overview",
  },
  {
    id: "heading-10-1",
    index: 1,
    level: 2,
    line: 10,
    position: 50,
    title: "Implementation",
  },
];

const setupDom = (): void => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Element", dom.window.Element);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("Event", dom.window.Event);
};

beforeEach(() => {
  cleanup();
  setupDom();
});

test("renders every heading as a persistent outline item without a vertical axis", () => {
  const view = render(
    <DocumentOutlineIndicator
      activeHeadingId="heading-10-1"
      headings={headings}
      onNavigate={vi.fn()}
    />,
  );

  const indicator = view.getByLabelText("Document outline");
  expect(
    indicator.querySelector<HTMLElement>('[data-surface="document-outline-indicator"]')?.style
      .height,
  ).toBe("");
  expect(indicator.querySelector("[data-outline-axis]")).toBeNull();
  expect(indicator.querySelectorAll(".outline-item")).toHaveLength(headings.length);
  expect(indicator.querySelectorAll(".outline-frame")).toHaveLength(headings.length);
  expect(indicator.querySelectorAll(".outline-title")).toHaveLength(headings.length);
  expect(
    indicator
      .querySelector('[data-outline-heading-id="heading-10-1"]')
      ?.getAttribute("data-active"),
  ).toBe("true");
  expect(
    indicator
      .querySelector<HTMLElement>('[data-outline-heading-id="heading-1-0"]')
      ?.style.getPropertyValue("--outline-marker-width"),
  ).toBe("24px");
  expect(
    indicator
      .querySelector<HTMLElement>('[data-outline-heading-id="heading-10-1"]')
      ?.style.getPropertyValue("--outline-marker-width"),
  ).toBe("15px");

  const navigation = view.getByLabelText("All document headings");
  expect(navigation.querySelectorAll("button")).toHaveLength(headings.length);
  expect(navigation.textContent).toContain("Overview");
  expect(navigation.textContent).toContain("Implementation");
});

test("changes hover state on an existing heading item instead of mounting a title overlay", () => {
  const view = render(
    <DocumentOutlineIndicator activeHeadingId={null} headings={headings} onNavigate={vi.fn()} />,
  );
  const browseButton = view.getByRole("button", { name: "Browse document outline" });
  Object.defineProperty(browseButton, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ height: 64, top: 50 }),
  });

  fireEvent.pointerMove(browseButton, { clientY: 10 });

  expect(view.container.querySelectorAll('[data-hovered="true"]')).toHaveLength(1);
  expect(view.container.querySelectorAll(".outline-title")).toHaveLength(headings.length);
  expect(view.container.querySelector("[data-outline-title-overlay]")).toBeNull();
});

test("places headings in a compact, evenly spaced outline", () => {
  const evenlySpacedHeadings = [
    ...headings,
    {
      id: "heading-50-2",
      index: 2,
      level: 3,
      line: 50,
      position: 100,
      title: "Summary",
    },
  ] as const;
  const view = render(
    <DocumentOutlineIndicator
      activeHeadingId={null}
      headings={evenlySpacedHeadings}
      onNavigate={vi.fn()}
    />,
  );

  const margins = Array.from(view.container.querySelectorAll<HTMLElement>(".outline-item")).map(
    (item) => item.style.marginBottom,
  );

  expect(margins).toEqual(["10px", "10px", "0px"]);
});
