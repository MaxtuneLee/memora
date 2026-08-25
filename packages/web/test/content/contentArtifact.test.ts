import { describe, expect, test } from "vite-plus/test";

import { ContentParserRegistry } from "@/lib/content/parserRegistry";
import { createSourceRevision } from "@/lib/content/sourceRevision";

describe("content artifacts", () => {
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
});
