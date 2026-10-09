import { describe, expect, test } from "vite-plus/test";

import { buildCitedMarkdown, buildContentBlocks } from "@/lib/chat/memoraJump";

const jump = (startSec: number): string =>
  `<memora-jump fileId="f1" fileName="Lecture" mediaType="video" startSec="${startSec}" endSec="${startSec + 5}" context="" />`;

const cite = (index: number): string => `<memora-cite index="${index}"></memora-cite>`;

describe("buildCitedMarkdown", () => {
  test("groups adjacent tags into one citation after the text they follow", () => {
    const result = buildCitedMarkdown(
      `First point.\n\n${jump(10)}\n${jump(20)}\n\nSecond point. ${jump(30)}`,
    );

    expect(result.markdown).toBe(`First point.${cite(1)}\n\nSecond point.${cite(2)}`);
    expect(result.citations.map((group) => group.map((item) => item.startSec))).toEqual([
      [10, 20],
      [30],
    ]);
  });

  test("keeps a citation after a code block or table out of the block", () => {
    const result = buildCitedMarkdown(`| a | b |\n| - | - |\n| 1 | 2 |\n${jump(10)}`);

    expect(result.markdown).toBe(`| a | b |\n| - | - |\n| 1 | 2 |\n\n${cite(1)}`);
  });

  test("leaves text without tags unchanged", () => {
    expect(buildCitedMarkdown("Plain answer.")).toEqual({
      markdown: "Plain answer.",
      citations: [],
    });
  });
});

describe("buildContentBlocks", () => {
  const widget = (toolCallId: string, contentOffset?: number) => ({
    toolCallId,
    title: toolCallId,
    loadingMessages: [],
    widgetCode: "<div></div>",
    phase: "ready" as const,
    ...(contentOffset !== undefined ? { contentOffset } : {}),
  });

  test("places each widget where it was called and numbers citations across the split", () => {
    const content = `Intro. ${jump(10)}\n\nAfter widget. ${jump(20)}`;
    const offset = content.indexOf("\n\nAfter");
    const { blocks, citations } = buildContentBlocks(content, [widget("w1", offset)]);

    expect(blocks.map((block) => (block.type === "text" ? block.markdown : block.key))).toEqual([
      `Intro.${cite(1)}`,
      "w1",
      `After widget.${cite(2)}`,
    ]);
    expect(citations).toHaveLength(2);
  });

  test("keeps widgets without an anchor above the text", () => {
    const { blocks } = buildContentBlocks("Answer.", [widget("old")]);

    expect(blocks.map((block) => block.key)).toEqual(["old", "text:0"]);
  });
});
