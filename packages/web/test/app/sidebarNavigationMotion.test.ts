import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

test("shares one active highlight across the primary sidebar navigation items", () => {
  const sidebarSource = readFileSync(
    new URL("../../src/app/components/Sidebar.tsx", import.meta.url),
    "utf8",
  );

  expect(sidebarSource).toContain('from "motion/react";');
  expect(sidebarSource).toContain("useReducedMotion");
  expect(sidebarSource).toContain('<LayoutGroup id="sidebar-primary-navigation">');
  expect(sidebarSource).toContain('layoutId="sidebar-active-item"');
});
