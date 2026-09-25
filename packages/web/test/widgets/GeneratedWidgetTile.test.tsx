import { cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { GeneratedWidgetTile } from "@/components/dashboard/homeGrid/GeneratedWidgetTile";
import type { WritableReactiveWidgetStore } from "@/lib/widgets/widgetStore";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";

const testState = vi.hoisted(() => ({
  data: { status: "loading" } as { status: string; value?: unknown },
  source: { status: "ready", code: "<div>Widget body</div>" } as {
    status: string;
    code: string | null;
  },
}));

vi.mock("@/hooks/widgets/useDataSourceValue", () => ({
  useDataSourceValue: () => testState.data,
}));
vi.mock("@/hooks/widgets/useWidgetSourceCode", () => ({
  useWidgetSourceCode: () => testState.source,
}));
vi.mock("@/lib/widgets/widgetQueries", () => ({
  resolveWidgetInstanceParams: () => ({}),
}));

const setupDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
};

const definition = {
  id: "definition-1",
  name: "Reading progress",
  dataSourceName: "chatSessionCount",
  sourceFileId: "source-1",
  folderId: "folder-1",
} as widgetDefinition;

const instance = {
  id: "instance-1",
  definitionId: definition.id,
} as widgetInstance;

const store = {} as WritableReactiveWidgetStore;

beforeEach(() => {
  setupDom();
  testState.data = { status: "loading" };
  testState.source = { status: "ready", code: "<div>Widget body</div>" };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("labels the card with the definition name and waits for the first data payload", () => {
  const view = render(
    <GeneratedWidgetTile store={store} definition={definition} instance={instance} />,
  );

  // The card draws no heading — the widget's own document owns its title — so the definition
  // name reaches assistive tech through the region label instead.
  expect(view.getByRole("region", { name: "Reading progress" })).toBeTruthy();
  expect(view.getByRole("status").textContent).toBe("Loading widget…");
  expect(view.getByText("Loading widget…")).toBeTruthy();
  expect(view.container.querySelector("iframe")).toBeNull();

  testState.data = { status: "ready", value: { count: 2 } };
  view.rerender(<GeneratedWidgetTile store={store} definition={definition} instance={instance} />);

  expect(view.container.querySelector('iframe[title="Reading progress"]')).toBeTruthy();
});

test("renders a contained error when the data resolver fails", () => {
  testState.data = { status: "error" };

  const view = render(
    <GeneratedWidgetTile store={store} definition={definition} instance={instance} />,
  );

  expect(view.getByRole("alert").textContent).toBe("This widget’s data couldn’t be loaded.");
});
