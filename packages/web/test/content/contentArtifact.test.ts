import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { restoreStoredFileMetadata } from "@/lib/content/contentTaskHandlers";
import { ContentParserRegistry, splitPptxMarkdownSegments } from "@/lib/content/parserRegistry";
import { createSourceRevision } from "@/lib/content/sourceRevision";

describe("content artifacts", () => {
  test("restores the display name and MIME type before resolving a stored PPTX parser", () => {
    const storedFile = new File(["pptx bytes"], "opfs-entry", {
      type: "application/octet-stream",
      lastModified: 42,
    });
    const restoredFile = restoreStoredFileMetadata(storedFile, {
      name: "roadmap.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const registry = new ContentParserRegistry();

    expect(restoredFile.name).toBe("roadmap.pptx");
    expect(restoredFile.type).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(restoredFile.lastModified).toBe(42);
    expect(registry.resolve(restoredFile)?.name).toBe("document");
  });

  test("creates a stable source revision from bytes and parser configuration", async () => {
    const file = new File(["# Notes\n\nA stable paragraph."], "notes.md", {
      type: "text/markdown",
    });
    const first = await createSourceRevision({
      file,
      content: await file.arrayBuffer(),
      parserVersion: "text-v1",
      configuration: { locale: "en-US" },
    });
    const second = await createSourceRevision({
      file,
      content: await file.arrayBuffer(),
      parserVersion: "text-v1",
      configuration: { locale: "en-US" },
    });
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  test("routes image files into the Playground OCR parser", () => {
    const registry = new ContentParserRegistry();
    const file = new File(["image bytes"], "Snipaste_2026-08-23_13-32-39.jpg", {
      type: "image/jpeg",
    });

    expect(registry.resolve(file)?.name).toBe("image");
  });

  test("generates deterministic segment IDs and preserves heading paths", async () => {
    const registry = new ContentParserRegistry();
    const file = new File(["# Notes\n\nA stable paragraph."], "notes.md", {
      type: "text/markdown",
    });
    const context = { fileId: "file-1", sourceRevision: "revision-1", file };
    const first = await registry.parse(context);
    const second = await registry.parse(context);

    expect(first.segments).toEqual(second.segments);
    expect(first.segments).toHaveLength(2);
    expect(first.segments[0]).toMatchObject({ kind: "title", text: "Notes" });
    expect(first.segments[1]).toMatchObject({ kind: "text", headingPath: ["Notes"] });
    expect(first.segments[0]?.id).toContain("file-1:");
  });

  test("parses audio transcripts as the indexable source", async () => {
    const registry = new ContentParserRegistry();
    const file = new File(
      [
        JSON.stringify({
          text: "The roadmap is ready.",
          words: [{ text: "roadmap", timestamp: [1, 2] }],
        }),
      ],
      "recording.transcript.json",
      { type: "application/json" },
    );
    const artifact = await registry.parse({
      fileId: "audio-1",
      sourceRevision: "revision-1",
      file,
    });
    expect(artifact.parser.name).toBe("transcript");
    expect(artifact.plainText).toContain("roadmap");
    expect(artifact.segments[0]?.locator).toMatchObject({ kind: "transcript", startSeconds: 1 });
  });

  test("wires PPTX Markdown into content indexing and reuses the visual desktop viewer", () => {
    const parserSource = readFileSync(
      new URL("../../src/lib/content/parserRegistry.ts", import.meta.url),
      "utf8",
    );
    const desktopPreviewSource = readFileSync(
      new URL("../../src/components/desktop/DocumentFilePreview.tsx", import.meta.url),
      "utf8",
    );
    const desktopViewerSource = readFileSync(
      new URL("../../src/components/desktop/PptxDocumentPreview.tsx", import.meta.url),
      "utf8",
    );

    expect(parserSource).toContain("markdown: parsed.markdown");
    expect(parserSource).toContain("splitPptxMarkdownSegments(parsed.markdown, parsed.slides)");
    expect(desktopPreviewSource).toContain('import("./PptxDocumentPreview")');
    expect(desktopViewerSource).toContain("useViewerBuildingBlocks");
    expect(desktopViewerSource).toContain("<SlideCanvas {...canvasProps} />");
    expect(desktopViewerSource).toContain("onSlideCountChange: setSlideCount");
    expect(desktopViewerSource).toContain('aria-label="Previous slide"');
    expect(desktopViewerSource).toContain('aria-label="Next slide"');
    expect(desktopViewerSource).toContain('className="flex min-h-0 flex-1 overflow-hidden"');
  });

  test("splits Playground PPTX Markdown into slide-aware index segments", () => {
    const markdown = `---
source: roadmap.pptx
---

## Slide 1: Product roadmap

- Ship the multi-slide preview
- Index the generated Markdown

---

## Slide 2: Follow-up *(layout: Title and Content)*

### Speaker Notes

Validate search results.`;
    const segments = splitPptxMarkdownSegments(markdown, []);

    expect(segments).toHaveLength(5);
    expect(segments[0]).toMatchObject({
      kind: "title",
      text: "Product roadmap",
      markdown: "## Slide 1: Product roadmap",
      headingPath: ["Product roadmap"],
      locator: { kind: "slide", slideNumber: 1 },
    });
    expect(segments[1]).toMatchObject({
      text: "Ship the multi-slide preview Index the generated Markdown",
      markdown: "- Ship the multi-slide preview\n- Index the generated Markdown",
      headingPath: ["Product roadmap"],
    });
    expect(segments[2]).toMatchObject({
      text: "Follow-up",
      headingPath: ["Follow-up"],
      locator: { kind: "slide", slideNumber: 2 },
    });
    expect(segments[4]).toMatchObject({
      text: "Validate search results.",
      headingPath: ["Follow-up", "Speaker Notes"],
    });
  });
});
