import { describe, expect, test } from "vite-plus/test";
import { getSearchTerms } from "../../src/lib/playground/searchTerms";

describe("getSearchTerms", () => {
  test("removes common English question words when meaningful terms remain", () => {
    expect(getSearchTerms("What decision was made about the study plan?")).toEqual([
      "decision",
      "study",
      "plan",
    ]);
  });

  test("keeps all terms when a query contains only stop words", () => {
    expect(getSearchTerms("what was it")).toEqual(["what", "was", "it"]);
  });

  test("keeps Chinese bigrams", () => {
    expect(getSearchTerms("学习计划怎么安排")).toEqual([
      "学习",
      "习计",
      "计划",
      "划怎",
      "怎么",
      "么安",
      "安排",
    ]);
  });
});
