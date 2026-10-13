import { describe, expect, it } from "vitest";

import { spotChecks, type AgentAttemptResult, type AgentEvaluationResult } from "../src/index";

const attempt = (
  questionId: string,
  retrieval: boolean,
  coverage: boolean,
  confidence: number,
): AgentAttemptResult => ({
  questionId,
  attempt: 1,
  passed: retrieval && coverage,
  latencyMs: 1,
  score: {
    scorerVersion: 1,
    retrieval: { passed: retrieval, groups: [] },
    timestamp: { medianDistanceSec: null, withinToleranceShare: null, uncitedGroups: 0 },
    citationPrecision: null,
  },
  coverage: {
    passed: coverage,
    verdict: {
      requiredPoints: [{ point: "p", supported: coverage, confidence: 0.95 }],
      disallowedClaims: [],
      unsupportedClaims: { present: false, confidence },
      rawOutput: "{}",
    },
  },
});

describe("spotChecks", () => {
  it("ranks disagreements, then low-confidence judgments, then the rest, least confident first", () => {
    const attempts = [
      attempt("agree-sure", true, true, 0.99),
      attempt("agree-unsure", true, true, 0.55),
      attempt("disagree-sure", true, false, 0.99),
      attempt("agree-less-unsure", false, false, 0.65),
      attempt("disagree-unsure", false, true, 0.6),
      { questionId: "failed", attempt: 1, passed: false, latencyMs: 1 },
    ];

    const checks = spotChecks({ attempts } as AgentEvaluationResult);

    expect(checks.map((check) => check.questionId)).toEqual([
      "disagree-unsure",
      "disagree-sure",
      "agree-unsure",
      "agree-less-unsure",
      "agree-sure",
    ]);
    expect(checks[0]).toEqual({
      questionId: "disagree-unsure",
      attempt: 1,
      retrievalPassed: false,
      coveragePassed: true,
      disagreement: true,
      lowConfidence: true,
      minConfidence: 0.6,
    });
  });
});
