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
