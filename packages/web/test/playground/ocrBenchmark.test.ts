import { describe, expect, test } from "vite-plus/test";

import { calculateTimingStats } from "@/lib/playground/ocrBenchmark";

describe("OCR benchmark timing", () => {
  test("calculates stable summary statistics without mutating samples", () => {
    const samples = [120, 80, 100];

    expect(calculateTimingStats(samples)).toEqual({
      samples: [120, 80, 100],
      mean: 100,
      median: 100,
      min: 80,
      max: 120,
    });
    expect(samples).toEqual([120, 80, 100]);
  });

  test("averages the two middle values for an even sample count", () => {
    expect(calculateTimingStats([40, 10, 30, 20]).median).toBe(25);
  });

  test("rejects an empty benchmark sample", () => {
    expect(() => calculateTimingStats([])).toThrow("At least one timing sample is required");
  });
});
