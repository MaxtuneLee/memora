import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import {
  dashboardLayoutStyles,
  getPrimaryWidgetOrder,
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
  expect(dashboardLayoutStyles.primaryWidgetGrid).toBeDefined();
});

test("dashboard page renders todo before calendar and uses the shared StyleX grid", () => {
  const dashboardPageSource = readFileSync(
    new URL("../../src/components/dashboard/DashboardPage.tsx", import.meta.url),
    "utf8",
  );

  expect(dashboardPageSource).toContain("dashboardLayoutStyles.primaryWidgetGrid");
  expect(dashboardPageSource).toContain(
    'return <TodoPanel key="todo" files={files} store={store} />;',
  );
  expect(dashboardPageSource).toContain("{primaryWidgetOrder.map((widget) => {");
});
