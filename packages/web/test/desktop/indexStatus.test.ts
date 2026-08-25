import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { getDesktopIndexStatusLabel } from "@/components/desktop/DesktopIndexStatus";

describe("desktop file index status", () => {
  test("provides concise labels for every file index state", () => {
    expect(getDesktopIndexStatusLabel("pending")).toBe("Pending");
    expect(getDesktopIndexStatusLabel("processing")).toBe("Indexing");
    expect(getDesktopIndexStatusLabel("indexed")).toBe("Indexed");
    expect(getDesktopIndexStatusLabel("failed")).toBe("Index failed");
  });

  test("opens file details from the status icon and renders a text label in details", () => {
    const itemSource = readFileSync(
      new URL("../../src/components/desktop/DesktopItem.tsx", import.meta.url),
      "utf8",
    );
    const previewSource = readFileSync(
      new URL("../../src/components/desktop/DesktopPreviewWindow.tsx", import.meta.url),
      "utf8",
    );

    expect(itemSource).toContain("<DesktopIndexStatusIcon");
    expect(itemSource).toContain("onOpenDetails={() => onOpenItem(item)}");
    expect(previewSource).toContain("Index status");
    expect(previewSource).toContain("<DesktopIndexStatusLabel status={item.indexState.status} />");
  });

  test("maps LiveStore index metadata into desktop file items", () => {
    const mapperSource = readFileSync(
      new URL("../../src/components/desktop/desktop/utils.ts", import.meta.url),
      "utf8",
    );

    expect(mapperSource).toContain("status: file.indexStatus");
    expect(mapperSource).toContain("file.indexedAt instanceof Date");
    expect(mapperSource).toContain("summary: file.indexSummary ?? null");
  });
});
