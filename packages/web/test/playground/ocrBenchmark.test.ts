import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

import { calculateTimingStats } from "@/lib/playground/ocrBenchmark";

describe("OCR benchmark timing", () => {
  test("calculates stable summary statistics without mutating samples", () => {
    const samples = [120, 80, 100];

    expect(calculateTimingStats(samples)).toEqual({
      samples: [120, 80, 100],
      mean: 100,
      median: 100,
      min: 80,
      max: 120,
    });
    expect(samples).toEqual([120, 80, 100]);
  });

  test("averages the two middle values for an even sample count", () => {
    expect(calculateTimingStats([40, 10, 30, 20]).median).toBe(25);
  });

  test("rejects an empty benchmark sample", () => {
    expect(() => calculateTimingStats([])).toThrow("At least one timing sample is required");
  });
});

describe("development playground wiring", () => {
  test("uses Base UI tabs and keeps the route behind the development guard", () => {
    const pageSource = readFileSync(
      new URL("../../src/components/playground/PlaygroundPage.tsx", import.meta.url),
      "utf8",
    );
    const routerSource = readFileSync(new URL("../../src/app/router.tsx", import.meta.url), "utf8");
    const sidebarSource = readFileSync(
      new URL("../../src/app/components/Sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(pageSource).toContain('import { Tabs } from "@base-ui/react/tabs"');
    expect(pageSource).toContain("<Tabs.Indicator");
    expect(routerSource).toContain("const developmentRoutes");
    expect(routerSource).toContain("import.meta.env.DEV");
    expect(sidebarSource).toContain('label: "Playground"');
    expect(sidebarSource).toContain("...(import.meta.env.DEV");
  });
});
