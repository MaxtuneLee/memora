import { describe, expect, test } from "vite-plus/test";

import { buildContentSearchItems } from "@/lib/search/searchItems";
import { filterSemanticHits, type ContentSearchResult } from "@/lib/search/contentSearchService";
import type { VectorDbSearchHit } from "@/lib/vector-db";

const hit = (chunkId: string, content: string, vectorDistance: number): VectorDbSearchHit =>
  ({
    chunkId,
    documentId: chunkId.split(":")[0],
    chunkIndex: 0,
    content,
    score: 0,
    vectorDistance,
  }) as VectorDbSearchHit;

const LONG = "A transcript sentence long enough to carry meaning on its own.";
// Distances from a real library for "a busy street"; the photo of a busy crossing is the match.
const busyStreet = [
  hit("tasks:1", "Open", 0.3012),
  hit("tasks:2", "Today Tasks", 0.305),
  hit("street:image", "1280x720_梵高", 0.3101),
  hit("note:1", "test", 0.3123),
  hit("week2:1", LONG, 0.328),
  hit("pomodoro:1", '{"day":"2026-09-22","completed":0,"mode":"focus"}', 0.3339),
  hit("tasks:3", "Done", 0.3369),
  hit("rec:1", LONG, 0.3477),
  hit("sast:1", "分别更适合优先调整前面所述的哪一个参数？", 0.3526),
  ...[
    0.3565, 0.3592, 0.3593, 0.3595, 0.3598, 0.3599, 0.36, 0.3607, 0.3642, 0.3652, 0.3654, 0.3668,
    0.3724, 0.3739, 0.3741, 0.3755, 0.3759, 0.3765, 0.3768, 0.3785, 0.3796, 0.3799, 0.3806, 0.3813,
    0.3814, 0.3821, 0.3826, 0.3827,
  ].map((distance, index) => hit(`bg:${index}`, LONG, distance)),
];

describe("content search presentation", () => {
  test("keeps file identity and page locator in the desktop intent", () => {
    const result: ContentSearchResult = {
      fileId: "file-1",
      fileName: "paper.pdf",
      fileMimeType: "application/pdf",
      fileType: "document",
      content: "A paragraph that only exists in the document body.",
      locator: { kind: "page", pageNumber: 7 },
      score: 0.8,
      chunkId: "chunk-1",
    };
    const [item] = buildContentSearchItems([result]);
    expect(item).toMatchObject({
      kind: "content",
      title: "paper.pdf",
      description: "Content match · Page 7",
      preview: result.content,
      fileIcon: {
        name: "paper.pdf",
        mimeType: "application/pdf",
        type: "document",
      },
      intent: {
        type: "desktop-intent",
        to: "/desktop",
        desktopIntent: { type: "openPreview", fileId: "file-1", locator: result.locator },
      },
    });
  });
});

describe("semantic hit filtering", () => {
  test("keeps the picture that matches and drops short chunks and the background", () => {
    expect(filterSemanticHits(busyStreet).map((entry) => entry.chunkId)).toEqual(["street:image"]);
  });

  // Search asks for 300 candidates, so unrelated chunks are the majority.
  const background = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      hit(`bg:${index}`, LONG, 0.3565 + (index % 28) * 0.001),
    );

  test.each([10, 100])("keeps all %i chunks that really match", (count) => {
    const matches = Array.from({ length: count }, (_, index) =>
      hit(`match:${index}`, LONG, 0.28 + (index % 20) * 0.001),
    );
    const kept = filterSemanticHits([...matches, ...background(300 - count)]);
    expect(kept).toHaveLength(count);
  });

  test("returns nothing when there are too few candidates to judge", () => {
    expect(filterSemanticHits(busyStreet.slice(0, 5))).toEqual([]);
  });
});
