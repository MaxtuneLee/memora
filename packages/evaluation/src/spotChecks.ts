import type { AgentEvaluationResult } from "./agentTypes";

/** Judgments below this confidence go to a reviewer ahead of confident ones. */
export const SPOT_CHECK_CONFIDENCE = 0.75;

export interface SpotCheck {
  questionId: string;
  attempt: number;
  retrievalPassed: boolean;
  coveragePassed: boolean;
  /** Retrieval and coverage disagree. */
  disagreement: boolean;
  lowConfidence: boolean;
  /** Lowest confidence among the judge's decisions. */
  minConfidence: number;
}

/**
 * Judged attempts in review order: disagreements between retrieval and coverage first,
 * then low-confidence judgments, then the rest; least confident first within each.
 */
export function spotChecks(result: Pick<AgentEvaluationResult, "attempts">): SpotCheck[] {
  const rank = (check: SpotCheck) => (check.disagreement ? 0 : check.lowConfidence ? 1 : 2);
  return result.attempts
    .flatMap(({ questionId, attempt, score, coverage }) => {
      if (!score || !coverage) return [];
      const { verdict } = coverage;
      const minConfidence = Math.min(
        verdict.unsupportedClaims.confidence,
        ...verdict.requiredPoints.map((decision) => decision.confidence),
        ...verdict.disallowedClaims.map((decision) => decision.confidence),
      );
      return [
        {
          questionId,
          attempt,
          retrievalPassed: score.retrieval.passed,
          coveragePassed: coverage.passed,
          disagreement: score.retrieval.passed !== coverage.passed,
          lowConfidence: minConfidence < SPOT_CHECK_CONFIDENCE,
          minConfidence,
        },
      ];
    })
    .sort((a, b) => rank(a) - rank(b) || a.minConfidence - b.minConfidence);
}
