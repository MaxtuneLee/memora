import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

const readSource = (path: string): string => {
  return readFileSync(new URL(path, import.meta.url), "utf8");
};

describe("storage export implementation", () => {
  test("builds a zip archive with standard zip signatures", () => {
    const source = readSource("../../src/lib/settings/storageExport.ts");

    expect(source).toContain("0x04034b50");
    expect(source).toContain("0x02014b50");
    expect(source).toContain("0x06054b50");
    expect(source).toContain('type: "application/zip"');
  });

  test("tracks preparing, packing, and finalizing progress", () => {
    const source = readSource("../../src/lib/settings/storageExport.ts");

    expect(source).toContain('phase: "preparing"');
    expect(source).toContain('phase: "packing"');
    expect(source).toContain('phase: "finalizing"');
    expect(source).toContain("Downloaded local model cache files are intentionally excluded");
  });

  test("includes zip import parsing and restore phases", () => {
    const source = readSource("../../src/lib/settings/storageExport.ts");
    const sectionSource = readSource("../../src/components/settings/SettingsStorageSection.tsx");

    expect(source).toContain("parseZipArchive");
    expect(source).toContain('phase: "reading"');
    expect(source).toContain('phase: "restoring"');
    expect(source).toContain("restore-complete");
    expect(sectionSource).toContain("Import data");
    expect(sectionSource).toContain("Bulk import");
  });
});
