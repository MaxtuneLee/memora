import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import {
  getPrimaryWidgetOrder,
  PRIMARY_WIDGET_GRID_CLASS,
} from "@/components/dashboard/dashboardLayout";

test("places todo before calendar when both primary widgets are visible", () => {
  expect(
    getPrimaryWidgetOrder({
      calendar: true,
      todo: true,
    }),
  ).toEqual(["todo", "calendar"]);
});

test("keeps only visible primary widgets in their intended order", () => {
  expect(
    getPrimaryWidgetOrder({
      calendar: true,
      todo: false,
    }),
  ).toEqual(["calendar"]);

  expect(
    getPrimaryWidgetOrder({
      calendar: false,
      todo: true,
    }),
  ).toEqual(["todo"]);
});

test("uses a wider desktop column for todo and a narrower one for calendar", () => {
  expect(PRIMARY_WIDGET_GRID_CLASS).toContain("lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]");
});

test("dashboard page renders todo before calendar and uses the shared grid class", () => {
  const dashboardPageSource = readFileSync(
    new URL("../../src/components/dashboard/DashboardPage.tsx", import.meta.url),
    "utf8",
  );

  expect(dashboardPageSource).toContain("className={PRIMARY_WIDGET_GRID_CLASS}");
  expect(dashboardPageSource).toContain(
    'return <TodoPanel key="todo" files={files} store={store} />;',
  );
  expect(dashboardPageSource).toContain("{primaryWidgetOrder.map((widget) => {");
});
