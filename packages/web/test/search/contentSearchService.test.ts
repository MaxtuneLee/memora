import { describe, expect, test } from "vite-plus/test";

import { buildContentSearchItems } from "@/lib/search/searchItems";
import type { ContentSearchResult } from "@/lib/search/contentSearchService";

describe("content search presentation", () => {
  test("keeps file identity and page locator in the desktop intent", () => {
    const result: ContentSearchResult = {
      fileId: "file-1",
      fileName: "paper.pdf",
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
      intent: {
        type: "desktop-intent",
        desktopIntent: { type: "openPreview", fileId: "file-1", locator: result.locator },
      },
    });
  });
});
