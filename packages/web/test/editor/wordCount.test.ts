import { expect, test } from "vite-plus/test";

import { measureTextLength } from "@/lib/editor/wordCount";

test("counts words for latin text, ignoring markdown syntax", () => {
  expect(measureTextLength("")).toEqual({ count: 0, unit: "words" });
  expect(measureTextLength("## Hello, world! It's 2026.")).toEqual({ count: 4, unit: "words" });
  expect(measureTextLength("A note about 缓存 and HTTP")).toEqual({ count: 5, unit: "words" });
});

test("counts characters for mostly CJK text, with latin words as one each", () => {
  expect(measureTextLength("HTTP1 到 HTTP2 的演进")).toEqual({ count: 6, unit: "characters" });
  expect(measureTextLength("| 版本 | 关键变化 |\n| --- | --- |")).toEqual({
    count: 6,
    unit: "characters",
  });
});
