import { describe, expect, test } from "vite-plus/test";

import {
  DEFAULT_RRF_K,
  getRrfContribution,
  normalizeRrfK,
  RRF_K_OPTIONS,
} from "../../src/lib/vector-db/reciprocalRankFusion";

describe("reciprocal rank fusion", () => {
  test("provides the benchmark rank constants", () => {
    expect(RRF_K_OPTIONS).toEqual([20, 40, 60, 80]);
  });

  test("calculates weighted RRF with the selected rank constant", () => {
    expect(getRrfContribution(1, 2, 60)).toBeCloseTo(2 / 61);
    expect(getRrfContribution(10, 1, 20)).toBeCloseTo(1 / 30);
  });

  test("normalizes invalid rank constants and ignores invalid contributions", () => {
    expect(normalizeRrfK(undefined)).toBe(DEFAULT_RRF_K);
    expect(normalizeRrfK(Number.NaN)).toBe(DEFAULT_RRF_K);
    expect(normalizeRrfK(0)).toBe(1);
    expect(getRrfContribution(0, 1, 60)).toBe(0);
    expect(getRrfContribution(1, 0, 60)).toBe(0);
  });
});
