import { describe, expect, test } from "vite-plus/test";

import { chunkContentArtifact } from "@/lib/content/chunkDocument";
import type { ContentArtifact } from "@/lib/content/types";

const artifact: ContentArtifact = {
  schemaVersion: 1,
  fileId: "file-1",
  sourceRevision: "revision-1",
  parser: { name: "test", version: "v1" },
  title: "A document",
  markdown: "A document",
  plainText: "A document",
  segments: [
    {
      id: "segment-1",
      kind: "text",
      text: "One two three four five six seven eight nine ten ".repeat(12),
      headingPath: ["Chapter 1"],
      locator: { kind: "page", pageNumber: 2 },
      searchable: true,
    },
  ],
  warnings: [],
  createdAt: 0,
};

describe("content chunking", () => {
  test("keeps locator and heading metadata on stable chunks", async () => {
    const first = await chunkContentArtifact(artifact, { size: 18, overlap: 4 });
    const second = await chunkContentArtifact(artifact, { size: 18, overlap: 4 });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first[0]).toMatchObject({
      documentId: "file-1",
      headingPath: ["Chapter 1"],
      locator: { kind: "page", pageNumber: 2 },
    });
    expect(new Set(first.map((chunk) => chunk.chunkId)).size).toBe(first.length);
  });

  test("uses a segment's Markdown as the indexable chunk content", async () => {
    const markdownArtifact: ContentArtifact = {
      ...artifact,
      segments: [
        {
          ...artifact.segments[0],
          text: "Quarterly plan",
          markdown: "## Quarterly plan\n\n- Ship the preview",
        },
      ],
    };

    const chunks = await chunkContentArtifact(markdownArtifact, { size: 200, overlap: 0 });
    expect(chunks[0]?.content).toBe("## Quarterly plan\n\n- Ship the preview");
  });
});
