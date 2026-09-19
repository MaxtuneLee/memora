import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { DATA_SOURCE_CATALOG } from "@/lib/widgets/dataSourceCatalog";

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
