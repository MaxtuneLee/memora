import { describe, expect, test } from "vite-plus/test";

import { chunkContentArtifact, estimateTokens } from "@/lib/content/chunkDocument";
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

  const textSegment = (
    id: string,
    text: string,
    start: number,
    headingPath = ["Chapter 1"],
  ): ContentArtifact["segments"][number] => ({
    id,
    kind: "text",
    text,
    headingPath,
    locator: { kind: "text", startOffset: start, endOffset: start + text.length },
    searchable: true,
  });

  test("cuts at sentence boundaries and carries whole sentences as overlap", async () => {
    const text =
      "Stemming reduces words. It helps recall. Chunking splits text. Sentences stay whole.";
    const chunks = await chunkContentArtifact(
      { ...artifact, segments: [textSegment("s", text, 0)] },
      { size: 12, overlap: 6 },
    );

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "Stemming reduces words. It helps recall.",
      "It helps recall. Chunking splits text.",
      "Chunking splits text. Sentences stay whole.",
    ]);
    expect(chunks[0]).toMatchObject({ startOffset: 0, endOffset: 40 });
  });

  test("splits Chinese text at sentence punctuation", async () => {
    const text = "今天天气很好。我们去公园散步。回家之后写代码。";
    const chunks = await chunkContentArtifact(
      { ...artifact, segments: [textSegment("s", text, 0)] },
      { size: 16, overlap: 0 },
    );

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "今天天气很好。我们去公园散步。",
      "回家之后写代码。",
    ]);
  });

  test("falls back to word-boundary cuts for a sentence longer than the window", async () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const chunks = await chunkContentArtifact(
      { ...artifact, segments: [textSegment("s", text, 0)] },
      { size: 8, overlap: 0 },
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(estimateTokens(chunk.content)).toBeLessThanOrEqual(8);
    expect(chunks.map((chunk) => chunk.content).join(" ")).toBe(text);
  });

  test("merges adjacent segments under the same heading and widens the locator", async () => {
    const chunks = await chunkContentArtifact(
      {
        ...artifact,
        segments: [
          textSegment("a", "First short block.", 0),
          textSegment("b", "Second short block.", 20),
          textSegment("c", "Other topic.", 45, ["Chapter 2"]),
        ],
      },
      { size: 100, overlap: 0 },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      content: "First short block.\n\nSecond short block.",
      locator: { kind: "text", startOffset: 0, endOffset: 39 },
      startOffset: 0,
      endOffset: 39,
    });
    expect(chunks[1]?.headingPath).toEqual(["Chapter 2"]);
  });

  test("does not merge segments across pages", async () => {
    const page = (id: string, pageNumber: number) => ({
      ...artifact.segments[0],
      id,
      text: "Short.",
      locator: { kind: "page" as const, pageNumber },
    });
    const chunks = await chunkContentArtifact(
      { ...artifact, segments: [page("a", 1), page("b", 2)] },
      { size: 100, overlap: 0 },
    );

    expect(chunks.map((chunk) => chunk.locator)).toEqual([
      { kind: "page", pageNumber: 1 },
      { kind: "page", pageNumber: 2 },
    ]);
  });
});
