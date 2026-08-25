import { describe, expect, test } from "vite-plus/test";

import {
  assertContentFileSize,
  createProcessingBudget,
  DEFAULT_CONTENT_PROCESSING_LIMITS,
} from "@/lib/content/processingLimits";

describe("content processing limits", () => {
  test("rejects files over the configured budget", () => {
    expect(() =>
      assertContentFileSize({
        name: "large.pdf",
        size: DEFAULT_CONTENT_PROCESSING_LIMITS.maxFileBytes + 1,
      }),
    ).toThrow("processing limit");
  });

  test("fails a processing budget after the time limit", () => {
    let current = 0;
    const budget = createProcessingBudget(
      { ...DEFAULT_CONTENT_PROCESSING_LIMITS, maxDurationMs: 10 },
      () => current,
    );
    current = 11;
    expect(() => budget.check()).toThrow("time limit");
  });
});
