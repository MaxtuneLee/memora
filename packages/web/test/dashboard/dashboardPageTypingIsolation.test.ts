import { existsSync, readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

test("dashboard page isolates the welcome typing effect from the main render tree", () => {
  const dashboardPagePath = new URL(
    "../../src/components/dashboard/DashboardPage.tsx",
    import.meta.url,
  );
  const welcomeHeadingPath = new URL(
    "../../src/components/dashboard/DashboardWelcomeHeading.tsx",
    import.meta.url,
  );
  const dashboardPageSource = readFileSync(dashboardPagePath, "utf8");

  expect(dashboardPageSource).toContain("DashboardWelcomeHeading");
  expect(dashboardPageSource).not.toContain("typedWelcomeTitle");
  expect(dashboardPageSource).not.toContain("hasTypedWelcomeTitle");
  expect(dashboardPageSource).not.toContain("WELCOME_TYPE_START_DELAY_MS");
  expect(dashboardPageSource).not.toContain("WELCOME_TYPE_INTERVAL_MS");
  expect(dashboardPageSource).not.toContain("window.setInterval");
  expect(existsSync(welcomeHeadingPath)).toBe(true);

  const welcomeHeadingSource = existsSync(welcomeHeadingPath)
    ? readFileSync(welcomeHeadingPath, "utf8")
    : "";

  expect(welcomeHeadingSource).toContain("typedWelcomeTitle");
  expect(welcomeHeadingSource).toContain("hasTypedWelcomeTitle");
  expect(welcomeHeadingSource).toContain("window.setInterval");
});
