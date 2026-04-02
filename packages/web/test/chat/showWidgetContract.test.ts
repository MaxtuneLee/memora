import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

test("interactive widget guidance includes svg layout rules", () => {
  const showWidgetSource = readFileSync(
    new URL("../../src/lib/chat/showWidget.ts", import.meta.url),
    "utf8",
  );
  const skillSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/SKILL.md", import.meta.url),
    "utf8",
  );
  const readmeSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/README.md", import.meta.url),
    "utf8",
  );

  expect(showWidgetSource).toContain(
    'interactive: ["sections/ui_components.md", "sections/color_palette.md", "sections/svg_setup.md"]',
  );
  expect(skillSource).toContain(
    '- `interactive`: `sections/ui_components.md`, `sections/color_palette.md`, `sections/svg_setup.md`',
  );
  expect(readmeSource).toContain(
    '- `interactive`: `sections/ui_components.md`, `sections/color_palette.md`, `sections/svg_setup.md`',
  );
});

test("widget iframe srcdoc includes svg helper styles", () => {
  const constantsSource = readFileSync(
    new URL("../../src/components/chat/chatWidget/constants.ts", import.meta.url),
    "utf8",
  );

  expect(constantsSource).toContain('import svgCss from "@/styles/svg.css?raw";');
  expect(constantsSource).toContain("${svgCss}");
});

test("widget and app font stacks use Noto Sans and IBM Plex Serif", () => {
  const widgetBaseCss = readFileSync(
    new URL("../../src/styles/widgetBase.css", import.meta.url),
    "utf8",
  );
  const tokensCss = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
  const indexCss = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");

  expect(widgetBaseCss).toContain('"Noto Sans"');
  expect(widgetBaseCss).toContain('"IBM Plex Serif"');
  expect(tokensCss).toContain('"Noto Sans"');
  expect(tokensCss).toContain('"IBM Plex Serif"');
  expect(indexCss).toContain("family=IBM+Plex+Serif");
  expect(indexCss).toContain("family=Noto+Sans");
  expect(indexCss).toContain("family=Noto+Sans+SC");
});

test("widget skill docs teach semantic-first non-overlapping layout", () => {
  const readmeSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/README.md", import.meta.url),
    "utf8",
  );
  const coreDesignSystemSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/sections/core_design_system.md", import.meta.url),
    "utf8",
  );
  const svgSetupSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/sections/svg_setup.md", import.meta.url),
    "utf8",
  );
  const whenNothingFitsSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/sections/when_nothing_fits.md", import.meta.url),
    "utf8",
  );

  expect(readmeSource).toContain("### Diagram thinking order");
  expect(readmeSource).toContain("Start from semantics, not coordinates.");
  expect(readmeSource).toContain("Default to non-overlap.");
  expect(coreDesignSystemSource).toContain("Default to non-overlap.");
  expect(svgSetupSource).toContain("Default to non-overlap:");
  expect(whenNothingFitsSource).toContain("If the only way to fit it is overlap, don't overlap it.");
});

test("widget skill docs teach narrow-column width budgeting", () => {
  const readmeSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/README.md", import.meta.url),
    "utf8",
  );
  const svgSetupSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/sections/svg_setup.md", import.meta.url),
    "utf8",
  );

  expect(readmeSource).toContain("567px wide");
  expect(readmeSource).toContain("narrow column");
  expect(svgSetupSource).toContain("567px wide");
  expect(svgSetupSource).toContain("Width budgeting is mandatory.");
  expect(svgSetupSource).toContain("Long explanatory text does not belong in SVG.");
});
