import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { getDesktopIndexStatusLabel } from "@/components/desktop/DesktopIndexStatus";
import { areDesktopItemsEqual } from "@/components/desktop/desktop/utils";

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

  test("treats cloned unchanged items as the same render input", () => {
    const item = {
      id: "file-1",
      name: "Notes",
      type: "file" as const,
      position: { x: 16, y: 16 },
      fileMeta: {
        id: "file-1",
        name: "Notes",
        type: "document" as const,
        mimeType: "text/plain",
        sizeBytes: 12,
        storageType: "opfs" as const,
        storagePath: "/files/file-1/source.txt",
        metaPath: "/files/file-1/file-1.meta.json",
        parentId: null,
        positionX: null,
        positionY: null,
        createdAt: 1,
        updatedAt: 2,
        durationSec: null,
        transcriptPath: null,
        transcriptPreview: null,
      },
      indexState: {
        status: "indexed" as const,
        indexedAt: 3,
        summary: "Notes",
      },
    };

    expect(
      areDesktopItemsEqual(item, {
        ...item,
        position: { ...item.position },
        fileMeta: { ...item.fileMeta },
        indexState: { ...item.indexState },
      }),
    ).toBe(true);
    expect(
      areDesktopItemsEqual(item, {
        ...item,
        indexState: { ...item.indexState, status: "processing" },
      }),
    ).toBe(false);
  });
});
