import { describe, expect, test } from "vite-plus/test";

import { buildCitedMarkdown } from "@/lib/chat/memoraJump";

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
