import { describe, expect, test } from "vite-plus/test";

import {
  evaluateRetrievalCase,
  summarizeRetrievalBenchmark,
  type RetrievalBenchmarkCase,
} from "../../src/lib/playground/retrievalBenchmark";

const benchmarkCase: RetrievalBenchmarkCase = {
  id: "NanoTest:q1",
  datasetId: "NanoTest",
  query: "Where is the answer?",
  relevantDocumentIds: ["relevant-a", "relevant-b"],
};

describe("retrieval benchmark", () => {
  test("calculates reciprocal rank, recall, hit rate input, and nDCG at 10", () => {
    const result = evaluateRetrievalCase(benchmarkCase, ["miss", "relevant-b", "relevant-a"], 12);

    expect(result.firstRelevantRank).toBe(2);
    expect(result.reciprocalRank).toBe(0.5);
    expect(result.recallAt10).toBe(1);
    expect(result.hitAt10).toBe(true);
    expect(result.ndcgAt10).toBeCloseTo(0.6934, 3);
  });

  test("limits all retrieval metrics to the first ten results", () => {
    const result = evaluateRetrievalCase(
      benchmarkCase,
      [...Array.from({ length: 10 }, (_, index) => `miss-${index}`), "relevant-a"],
      8,
    );

    expect(result.firstRelevantRank).toBeNull();
    expect(result.recallAt10).toBe(0);
    expect(result.hitAt10).toBe(false);
    expect(result.ndcgAt10).toBe(0);
  });

  test("macro-averages all public benchmark queries", () => {
    const hit = evaluateRetrievalCase(benchmarkCase, ["relevant-a"], 10);
    const miss = evaluateRetrievalCase(benchmarkCase, ["miss"], 20);
    const report = summarizeRetrievalBenchmark([hit, miss], 1, 40);

    expect(report.mrr).toBe(0.5);
    expect(report.recallAt10).toBe(0.25);
    expect(report.hitRate).toBe(0.5);
    expect(report.ndcgAt10).toBeCloseTo(0.3066, 3);
    expect(report.evaluatedCaseCount).toBe(2);
    expect(report.skippedCaseCount).toBe(1);
  });
});
