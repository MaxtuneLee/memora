import { describe, expect, it } from "vite-plus/test";

import { rerankCandidateIds, scoreBeirRanking } from "../../src/lib/playground/beirRerankerMetrics";

describe("BEIR cross-encoder comparison", () => {
  it("uses raw logits, preserves stable ties, and never introduces new candidates", () => {
    expect(
      rerankCandidateIds(
        ["a", "b", "c"],
        [
          { documentId: "a", logit: -4 },
          { documentId: "c", logit: 7 },
          { documentId: "b", logit: 7 },
        ],
      ),
    ).toEqual(["b", "c", "a"]);
  });

  it("detects missing, duplicate and non-finite pair outputs", () => {
    expect(() => rerankCandidateIds(["a", "b"], [{ documentId: "a", logit: 1 }])).toThrow();
    expect(() =>
      rerankCandidateIds(
        ["a", "b"],
        [
          { documentId: "a", logit: 1 },
          { documentId: "a", logit: 2 },
        ],
      ),
    ).toThrow();
    expect(() => rerankCandidateIds(["a"], [{ documentId: "a", logit: NaN }])).toThrow();
  });

  it("allows Recall@20 improvement only when candidates extend beyond twenty", () => {
    const ids = Array.from({ length: 30 }, (_, i) => String(i));
    const relevance = { "29": 1 };
    expect(scoreBeirRanking(ids, relevance, 20).recall).toBe(0);
    const ranked = rerankCandidateIds(
      ids,
      ids.map((documentId) => ({ documentId, logit: documentId === "29" ? 4 : -2 })),
    );
    expect(scoreBeirRanking(ranked, relevance, 20)).toEqual({ ndcg: 1, recall: 1 });
    expect(new Set(ranked)).toEqual(new Set(ids));
  });

  it("retains missing positive documents in graded normalization and recall denominators", () => {
    const relevance = { present: 2, missing: 1 };
    const value = scoreBeirRanking(["present", "unrelated"], relevance, 20);
    expect(value.recall).toBe(0.5);
    expect(value.ndcg).toBeCloseTo(2 / (2 + 1 / Math.log2(3)), 12);
    expect(scoreBeirRanking(["unrelated"], { missing: 1 }, 20)).toEqual({ ndcg: 0, recall: 0 });
  });
});

it("ranks raw Jev relevance probabilities without folding no-confidence", () => {
  expect(
    rerankCandidateIds(
      ["no", "yes"],
      [
        { documentId: "no", relevanceProbability: 0.1 },
        { documentId: "yes", relevanceProbability: 0.8 },
      ],
    ),
  ).toEqual(["yes", "no"]);
});
