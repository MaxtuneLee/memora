import { describe, expect, test } from "vite-plus/test";

import { buildContentSearchItems } from "@/lib/search/searchItems";
import {
  filterSemanticHits,
  searchContent,
  type ContentSearchResult,
} from "@/lib/search/contentSearchService";
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

describe("image previews", () => {
  test("content matches of images carry the picture to preview", () => {
    const base: ContentSearchResult = {
      fileId: "img",
      fileName: "street.png",
      fileMimeType: "image/png",
      fileType: "image",
      content: "street.png",
      score: 1,
      chunkId: "img:image",
    };
    const [image, text] = buildContentSearchItems([
      { ...base, imagePath: "/files/img/thumb.webp" },
      { ...base, fileType: "document", chunkId: "doc:1" },
    ]);
    expect(image?.imagePath).toBe("/files/img/thumb.webp");
    expect(text?.imagePath).toBeUndefined();
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

describe("fusing keyword and semantic hits", () => {
  test("a striking semantic match beats a chunk that matches both lists weakly", async () => {
    // Shaped like a real "camera" search: a PDF chunk has the keyword and a modest semantic
    // match (similarity 0.64); a photo of a camera matches far better (0.77) with no keyword.
    const pdf = {
      ...hit("pdf:3", "讲讲校园里你发现了哪些巧妙机位 camera 构图", 0.3558),
      bm25Score: 8,
    };
    const photo = hit("photo:image", "Camera photo", 0.2296);
    const semanticHits = [
      photo,
      pdf,
      ...Array.from({ length: 298 }, (_, index) =>
        hit(`bg${index}:1`, LONG, 0.385 + (index % 30) * 0.001),
      ),
    ];
    const vectorDb = {
      forIndex: (config: { model: string }) => ({
        search: async () => (config.model === "lexical-only" ? [pdf] : semanticHits),
      }),
    };
    const files = ["pdf", "photo", ...Array.from({ length: 298 }, (_, index) => `bg${index}`)].map(
      (id) => ({ id, name: id, mimeType: "", type: "document", deletedAt: null, purgedAt: null }),
    );
    const results = await searchContent({
      query: "camera",
      vectorDb: vectorDb as never,
      files: files as never,
      semantic: {
        indexConfig: { model: "semantic", dimensions: 2 },
        embed: async () => [new Float32Array([1, 0])],
      } as never,
      standoutOnly: true,
    });
    expect(results.map((result) => result.fileId).slice(0, 2)).toEqual(["photo", "pdf"]);
  });

  test("the assistant's search keeps rank fusion, where a chunk in both lists leads", async () => {
    // Shaped like a real "camera" search: a PDF chunk has the keyword and a modest semantic
    // match (similarity 0.64); a photo of a camera matches far better (0.77) with no keyword.
    const pdf = {
      ...hit("pdf:3", "讲讲校园里你发现了哪些巧妙机位 camera 构图", 0.3558),
      bm25Score: 8,
    };
    const photo = hit("photo:image", "Camera photo", 0.2296);
    const semanticHits = [
      photo,
      pdf,
      ...Array.from({ length: 298 }, (_, index) =>
        hit(`bg${index}:1`, LONG, 0.385 + (index % 30) * 0.001),
      ),
    ];
    const vectorDb = {
      forIndex: (config: { model: string }) => ({
        search: async () => (config.model === "lexical-only" ? [pdf] : semanticHits),
      }),
    };
    const files = ["pdf", "photo", ...Array.from({ length: 298 }, (_, index) => `bg${index}`)].map(
      (id) => ({ id, name: id, mimeType: "", type: "document", deletedAt: null, purgedAt: null }),
    );
    const results = await searchContent({
      query: "camera",
      vectorDb: vectorDb as never,
      files: files as never,
      semantic: {
        indexConfig: { model: "semantic", dimensions: 2 },
        embed: async () => [new Float32Array([1, 0])],
      } as never,
    });
    expect(results.map((result) => result.fileId).slice(0, 2)).toEqual(["pdf", "photo"]);
  });

  test("a modest semantic match still beats keyword-only hits with near-equal BM25", async () => {
    // Shaped like the second real search: keyword hits all score about the same, and the
    // matching picture stands out by only about five deviations.
    const keywordHits = Array.from({ length: 8 }, (_, index) => ({
      ...hit(`note${index}:1`, LONG, 0.5),
      bm25Score: 10 - index * 0.05,
    }));
    const picture = hit("painting:image", "Painting", 0.2927);
    const semanticHits = [
      picture,
      ...Array.from({ length: 299 }, (_, index) =>
        hit(`bg${index}:1`, LONG, 0.33 + (index % 30) * 0.001),
      ),
    ];
    const ids = [
      "painting",
      ...keywordHits.map((entry) => entry.documentId),
      ...semanticHits.slice(1).map((entry) => entry.documentId),
    ];
    const results = await searchContent({
      query: "painting",
      vectorDb: {
        forIndex: (config: { model: string }) => ({
          search: async () => (config.model === "lexical-only" ? keywordHits : semanticHits),
        }),
      } as never,
      files: ids.map((id) => ({
        id,
        name: id,
        mimeType: "",
        type: "document",
        deletedAt: null,
        purgedAt: null,
      })) as never,
      semantic: {
        indexConfig: { model: "semantic", dimensions: 2 },
        embed: async () => [new Float32Array([1, 0])],
      } as never,
      standoutOnly: true,
    });
    expect(results[0]?.fileId).toBe("painting");
  });
});
