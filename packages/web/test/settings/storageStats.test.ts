import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

const readSource = (path: string): string => {
  return readFileSync(new URL(path, import.meta.url), "utf8");
};

test("storage settings keep downloaded models out of user content", () => {
  const statsSource = readSource("../../src/hooks/settings/useStorageStats.ts");
  const sectionSource = readSource("../../src/components/settings/SettingsStorageSection.tsx");

  expect(statsSource).not.toContain('id: "models"');
  expect(statsSource).toContain("modelCacheUsage");
  expect(statsSource).toContain("internalDataUsage = Math.max(0, normalizedModelCacheUsage)");
  expect(sectionSource).not.toContain("Files and downloaded models saved by Memora.");
});
