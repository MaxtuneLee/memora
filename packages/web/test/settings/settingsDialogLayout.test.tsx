import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

test("settings dialog source keeps the shell minimal while preserving collapsible mobile sections", () => {
  const dialogSource = readFileSync(
    new URL("../../src/components/settings/SettingsDialog.tsx", import.meta.url),
    "utf8",
  );
  const classNamesSource = readFileSync(
    new URL("../../src/components/settings/settingsClassNames.ts", import.meta.url),
    "utf8",
  );
  const indexCss = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");
  const pptxViewerCss = readFileSync(
    new URL("../../src/styles/pptxViewer.css", import.meta.url),
    "utf8",
  );

  expect(dialogSource).toContain("isMobileNavigationOpen");
  expect(dialogSource).toContain(">Sections<");
  expect(dialogSource).toContain("aria-expanded={isMobileNavigationOpen}");
  expect(dialogSource).not.toContain(">Settings<");
  expect(dialogSource).toContain('fontFamily: "var(--font-serif)"');
  expect(dialogSource).toContain('height: "min(88vh, 720px)"');
  expect(dialogSource).toContain('navStack: { display: "flex", flexDirection: "column", gap: 2 }');
  expect(dialogSource).toContain('justifyContent: "flex-start"');
  expect(dialogSource).toContain('layoutGroupId="settings-section-navigation-desktop"');
  expect(dialogSource).toContain('layoutGroupId="settings-section-navigation-mobile"');
  expect(dialogSource).toContain('layoutId="settings-active-item"');
  expect(dialogSource).toContain('layoutId="settings-mobile-active-item"');
  expect(dialogSource).toContain("navActive: { color: tokens.textStrong }");
  expect(dialogSource).toContain("useReducedMotion");
  expect(classNamesSource).toContain('fontFamily: "var(--font-serif)"');
  expect(indexCss).toContain('@import "./styles/tokens.css";');
  expect(pptxViewerCss).toContain('@import "pptx-react-viewer/styles" layer(pptx-viewer);');
});
