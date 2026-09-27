import type { AgentAttemptResult, AgentEvaluationResult, AttemptFailureReason } from "./agentTypes";
import { UNCERTAIN_CONFIDENCE } from "./runAgentEvaluation";

export type AttemptStatus = "passed" | "uncertain" | "failed" | "error";

export const attemptStatus = (attempt: AgentAttemptResult): AttemptStatus =>
  attempt.passed
    ? "passed"
    : attempt.failure
      ? "error"
      : attempt.uncertain
        ? "uncertain"
        : "failed";

const FAILURE_LABELS: Record<AttemptFailureReason, string> = {
  error: "Agent error",
  timeout: "Timed out",
  "judge-error": "Judge error",
};

/** Why an attempt did not pass, one line per cause; empty for a passed attempt. */
export function attemptFailureReasons(attempt: AgentAttemptResult): string[] {
  if (attempt.passed) return [];
  const reasons: string[] = [];
  if (attempt.failure)
    reasons.push(`${FAILURE_LABELS[attempt.failure.reason]}: ${attempt.failure.message}`);
  attempt.score?.retrieval.groups.forEach((group, index) => {
    if (group.hit) return;
    reasons.push(
      group.distanceSec === null
        ? `Evidence group ${index + 1} not cited`
        : `Evidence group ${index + 1} not cited (closest citation ${Math.round(group.distanceSec)} s away)`,
    );
  });
  const verdict = attempt.coverage?.verdict;
  if (verdict) {
    // Unsupported claims are shown with the verdict; they do not fail an attempt.
    const unsure = (confidence: number) => confidence < UNCERTAIN_CONFIDENCE;
    for (const decision of verdict.requiredPoints)
      if (unsure(decision.confidence))
        reasons.push(`Judge unsure whether this point is supported: ${decision.point}`);
      else if (!decision.supported) reasons.push(`Required point not supported: ${decision.point}`);
    for (const decision of verdict.disallowedClaims)
      if (unsure(decision.confidence))
        reasons.push(`Judge unsure whether this claim was made: ${decision.claim}`);
      else if (decision.present) reasons.push(`Disallowed claim made: ${decision.claim}`);
  }
  for (const check of attempt.preference?.checks ?? [])
    if (!check.passed) reasons.push(`Preference not followed: ${check.label} (${check.detail})`);
  return reasons;
}

export interface AgentTokenTotals {
  /** Input not served from the provider's prompt cache. */
  input: number;
  /** Input served from the prompt cache; older results did not record it. */
  cached: number;
  output: number;
  /** Attempts without token counts: no answer, or no settled Trace. */
  unknownAttempts: number;
}

export const agentTokenTotals = (
  attempts: Array<Pick<AgentAttemptResult, "answer" | "trace">>,
): AgentTokenTotals => {
  const totals = { input: 0, cached: 0, output: 0, unknownAttempts: 0 };
  for (const attempt of attempts) {
    const tokens = (attempt.answer ?? attempt.trace)?.tokens;
    if (!tokens) totals.unknownAttempts += 1;
    else {
      totals.input += tokens.input;
      totals.cached += tokens.cached ?? 0;
      totals.output += tokens.output;
    }
  }
  return totals;
};

/** Sums the numeric fields of the `usage` object Jev returns with each verdict. */
const judgeUsage = (attempts: AgentAttemptResult[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const attempt of attempts) {
    const raw = attempt.coverage?.verdict.rawOutput;
    if (!raw) continue;
    let usage: unknown;
    try {
      usage = (JSON.parse(raw) as { usage?: unknown } | null)?.usage;
    } catch {
      continue;
    }
    if (!usage || typeof usage !== "object") continue;
    for (const [key, value] of Object.entries(usage))
      if (typeof value === "number" && Number.isFinite(value))
        totals[key] = (totals[key] ?? 0) + value;
  }
  return totals;
};

export interface AgentEvaluationTotals {
  /** Shares of completed attempts; null before any attempt completes. */
  passRate: number | null;
  uncertainRate: number | null;
  retrievalRate: number | null;
  coverageRate: number | null;
  /** Hits over all citations of every attempt; null without citations. */
  citationPrecision: number | null;
  agentTokens: AgentTokenTotals;
  judgeUsage: Record<string, number>;
  durationMs: number;
}

export function agentEvaluationTotals(
  result: Pick<AgentEvaluationResult, "attempts" | "summary" | "startedAt" | "finishedAt">,
): AgentEvaluationTotals {
  const { attempts, summary } = result;
  const rate = (count: number) => (attempts.length === 0 ? null : count / attempts.length);
  let citations = 0;
  let hits = 0;
  for (const attempt of attempts) {
    const precision = attempt.score?.citationPrecision;
    const count = attempt.answer?.citations.length ?? 0;
    if (precision === null || precision === undefined) continue;
    citations += count;
    hits += precision * count;
  }
  return {
    passRate: rate(summary.passed),
    uncertainRate: rate(summary.uncertain ?? 0),
    retrievalRate: rate(summary.retrievalPassed),
    coverageRate: rate(summary.coveragePassed),
    citationPrecision: citations === 0 ? null : hits / citations,
    agentTokens: agentTokenTotals(attempts),
    judgeUsage: judgeUsage(attempts),
    durationMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt),
  };
}

export interface QuestionAttempts {
  questionId: string;
  passes: number;
  attempts: AgentAttemptResult[];
}

/** Attempts under each question, in the given question order and by attempt number. */
export const groupAttemptsByQuestion = (
  questionIds: string[],
  attempts: AgentAttemptResult[],
): QuestionAttempts[] =>
  questionIds.map((questionId) => {
    const own = attempts
      .filter((attempt) => attempt.questionId === questionId)
      .sort((a, b) => a.attempt - b.attempt);
    return {
      questionId,
      passes: own.filter((attempt) => attempt.passed).length,
      attempts: own,
    };
  });
