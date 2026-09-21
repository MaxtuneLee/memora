import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { DATA_SOURCE_CATALOG } from "@/lib/widgets/dataSourceCatalog";
import { HOME_GRID_GAP_PX, HOME_GRID_MAX_SPAN } from "@/lib/widgets/homeGridLayout";

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
    "- `interactive`: `sections/ui_components.md`, `sections/color_palette.md`, `sections/svg_setup.md`",
  );
  expect(readmeSource).toContain(
    "- `interactive`: `sections/ui_components.md`, `sections/color_palette.md`, `sections/svg_setup.md`",
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
    new URL(
      "../../bundled-skills/show-widget-skills/sections/core_design_system.md",
      import.meta.url,
    ),
    "utf8",
  );
  const svgSetupSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/sections/svg_setup.md", import.meta.url),
    "utf8",
  );
  const whenNothingFitsSource = readFileSync(
    new URL(
      "../../bundled-skills/show-widget-skills/sections/when_nothing_fits.md",
      import.meta.url,
    ),
    "utf8",
  );

  expect(readmeSource).toContain("### Diagram thinking order");
  expect(readmeSource).toContain("Start from semantics, not coordinates.");
  expect(readmeSource).toContain("Default to non-overlap.");
  expect(coreDesignSystemSource).toContain("Default to non-overlap.");
  expect(svgSetupSource).toContain("Default to non-overlap:");
  expect(whenNothingFitsSource).toContain(
    "If the only way to fit it is overlap, don't overlap it.",
  );
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

test("widget skill docs teach Home Grid square-cell sizing using the grid's own constants", () => {
  const readmeSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/README.md", import.meta.url),
    "utf8",
  );
  const coreDesignSystemSource = readFileSync(
    new URL(
      "../../bundled-skills/show-widget-skills/sections/core_design_system.md",
      import.meta.url,
    ),
    "utf8",
  );

  // Pinned to the real layout constants so the numbers a widget author reads cannot drift away
  // from the grid that actually renders the saved widget.
  for (const source of [readmeSource, coreDesignSystemSource]) {
    expect(source).toContain("### Home Grid sizing");
    expect(source).toContain(`\`${HOME_GRID_GAP_PX}px\` gap`);
    expect(source).toContain("starts at **1 × 1**");
    expect(source).toContain(`up to \`${HOME_GRID_MAX_SPAN} × ${HOME_GRID_MAX_SPAN}\``);
  }
});

test("widget skill docs settle Home Grid vs chat destination before picking a module", () => {
  const skillDir = new URL("../../bundled-skills/show-widget-skills/", import.meta.url);
  const readmeSource = readFileSync(new URL("README.md", skillDir), "utf8");
  const skillSource = readFileSync(new URL("SKILL.md", skillDir), "utf8");
  const modulesSource = readFileSync(new URL("sections/modules.md", skillDir), "utf8");

  // Every assembled guideline inlines the shared sections, so the destination step has to reach
  // all of them — a module doc that skips it re-creates the "build a full chat panel" default.
  const guidelineSources = [
    "art",
    "art_interactive",
    "chart",
    "chart_interactive",
    "CORE",
    "diagram",
    "interactive",
    "mockup",
  ].map((module) => readFileSync(new URL(`guidelines/${module}.md`, skillDir), "utf8"));

  for (const source of [readmeSource, modulesSource, ...guidelineSources]) {
    expect(source).toContain("## Destination — decide before the module");
    expect(source).toContain("ask one short question before building");
    expect(source).toContain("is not automatically a full-size panel");
  }

  expect(skillSource).toContain("Settle the destination before designing anything");
  expect(readmeSource).toContain("Settle the destination before designing anything");
});

test("chart dashboard guidance fixes the canvas before choosing contents", () => {
  const skillDir = new URL("../../bundled-skills/show-widget-skills/", import.meta.url);
  const chartSources = [
    "sections/charts_chart_js.md",
    "guidelines/chart.md",
    "guidelines/chart_interactive.md",
  ].map((path) => readFileSync(new URL(path, skillDir), "utf8"));

  for (const source of chartSources) {
    expect(source).toContain("**Dashboard layout** — fix the canvas before choosing the contents.");
    expect(source).toContain("Never design the full dashboard and then shrink it");
  }
});

test("widget skill docs document every data source catalog entry and the onData/getData bindings", () => {
  const readmeSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/README.md", import.meta.url),
    "utf8",
  );
  const skillSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/SKILL.md", import.meta.url),
    "utf8",
  );

  for (const entry of DATA_SOURCE_CATALOG) {
    expect(readmeSource).toContain(entry.name);
  }
  expect(readmeSource).toContain("data_source_params");
  expect(readmeSource).toContain("onData");
  expect(readmeSource).toContain("getData");
  expect(skillSource).toContain("data_source");
});

test("widget skill docs teach how to use every catalog entry's payload, not just its shape", () => {
  const readmeSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/README.md", import.meta.url),
    "utf8",
  );

  const catalogSection = readmeSource.slice(
    readmeSource.indexOf("## Data source catalog"),
    readmeSource.indexOf("## Persisting the widget's own data"),
  );

  for (const entry of DATA_SOURCE_CATALOG) {
    // Each entry's payload shape appears in the table; its usage guidance must also name the
    // entry a second time — once for "what it is", once for "how to render it".
    const mentions = catalogSection.split(entry.name).length - 1;
    expect(mentions).toBeGreaterThanOrEqual(2);
  }
});

test("widget skill docs point to widget_data.md before writing onData for widgetData, and it teaches arrival-order handling and bans browser storage", () => {
  const readmeSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/README.md", import.meta.url),
    "utf8",
  );
  const skillSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/SKILL.md", import.meta.url),
    "utf8",
  );
  const widgetDataSource = readFileSync(
    new URL("../../bundled-skills/show-widget-skills/sections/widget_data.md", import.meta.url),
    "utf8",
  );

  expect(readmeSource).toContain("sections/widget_data.md");
  expect(skillSource).toContain("sections/widget_data.md");
  expect(widgetDataSource).toContain("arrival order, not call order");
  expect(widgetDataSource).toContain("localStorage");
  expect(widgetDataSource).toContain("sessionStorage");
});
