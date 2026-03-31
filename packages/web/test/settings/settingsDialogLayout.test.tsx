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

  expect(dialogSource).toContain("isMobileNavigationOpen");
  expect(dialogSource).toContain(">Sections<");
  expect(dialogSource).toContain("aria-expanded={isMobileNavigationOpen}");
  expect(dialogSource).not.toContain(">Settings<");
  expect(dialogSource).toContain('fontFamily: "var(--font-serif)"');
  expect(dialogSource).toContain('h-[min(88vh,720px)]');
  expect(dialogSource).toContain("space-y-0.5");
  expect(dialogSource).toContain("group relative flex w-full items-center gap-2.5");
  expect(dialogSource).toContain('layoutGroupId="settings-section-navigation-desktop"');
  expect(dialogSource).toContain('layoutGroupId="settings-section-navigation-mobile"');
  expect(dialogSource).toContain('layoutId="settings-active-item"');
  expect(dialogSource).toContain('layoutId="settings-mobile-active-item"');
  expect(dialogSource).toContain("text-zinc-900");
  expect(dialogSource).toContain("useReducedMotion");
  expect(classNamesSource).toContain("[font-family:var(--font-serif)]");
});
