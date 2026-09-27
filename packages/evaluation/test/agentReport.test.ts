import { describe, expect, it } from "vitest";

import {
  agentEvaluationTotals,
  attemptFailureReasons,
  attemptStatus,
  citationHits,
  groupAttemptsByQuestion,
  type AgentAttemptResult,
  type AgentEvaluationResult,
  type CitationScore,
  type EvaluationQuestion,
  type JudgeVerdict,
} from "../src/index";

const question: EvaluationQuestion = {
  questionId: "q1",
  question: "What is it?",
  lectureIds: ["lec11"],
  evidence: [
    [
      { lectureId: "lec11", startCueId: "a", endCueId: "b", startMs: 100_000, endMs: 110_000 },
      { lectureId: "lec12", startCueId: "c", endCueId: "d", startMs: 5_000, endMs: 6_000 },
    ],
    [{ lectureId: "lec11", startCueId: "e", endCueId: "f", startMs: 300_000, endMs: 301_000 }],
  ],
  requiredPoints: ["first point", "second point"],
  disallowedClaims: ["a wrong claim"],
  kind: "two-segment",
};

const score = (passed: boolean, precision: number | null = 1): CitationScore => ({
  scorerVersion: 1,
  retrieval: {
    passed,
    groups: [
      { hit: true, distanceSec: 0 },
      passed ? { hit: true, distanceSec: 2 } : { hit: false, distanceSec: 40 },
    ],
  },
  timestamp: { medianDistanceSec: 1, withinToleranceShare: 1, uncitedGroups: 0 },
  citationPrecision: precision,
});

const verdict = (overrides: Partial<JudgeVerdict> = {}): JudgeVerdict => ({
  requiredPoints: [
    { point: "first point", supported: true, confidence: 0.9 },
    { point: "second point", supported: true, confidence: 0.9 },
  ],
  disallowedClaims: [{ claim: "a wrong claim", present: false, confidence: 0.9 }],
  unsupportedClaims: { present: false, confidence: 0.9 },
  rawOutput: JSON.stringify({ answers: {}, usage: { input_tokens: 100, output_tokens: 4 } }),
  ...overrides,
});

const attempt = (overrides: Partial<AgentAttemptResult>): AgentAttemptResult => ({
  questionId: "q1",
  attempt: 1,
  passed: false,
  latencyMs: 1,
  ...overrides,
});

const answer = (citations: number, tokens?: { input: number; output: number }) => ({
  answer: "x",
  citations: Array.from({ length: citations }, () => ({ fileId: "f11", startSec: 1, endSec: 1 })),
  sessionId: "s",
  runId: "r",
  fallbackTrims: 0,
  ...(tokens ? { tokens } : {}),
});

const passed = attempt({
  passed: true,
  answer: answer(2, { input: 1_000, output: 50 }),
  score: score(true, 1),
  coverage: { passed: true, verdict: verdict() },
});
const retrievalMiss = attempt({
  attempt: 2,
  answer: answer(2, { input: 500, output: 20 }),
  score: score(false, 0.5),
  coverage: {
    passed: false,
    verdict: verdict({
      requiredPoints: [
        { point: "first point", supported: true, confidence: 0.9 },
        { point: "second point", supported: false, confidence: 0.6 },
      ],
      disallowedClaims: [{ claim: "a wrong claim", present: true, confidence: 0.7 }],
      unsupportedClaims: { present: true, confidence: 0.8 },
    }),
  },
});
const timedOut = attempt({
  attempt: 3,
  failure: { reason: "timeout", name: "TimeoutError", message: "The operation timed out." },
});

describe("citationHits", () => {
  it("marks each citation hit when it lands within tolerance of any window of the question", () => {
    const fileLectures = { f11: "lec11", f12: "lec12" };
    expect(
      citationHits(
        question,
        [
          { fileId: "f11", startSec: 104, endSec: 106 },
          { fileId: "f11", startSec: 115, endSec: 116 },
          { fileId: "f11", startSec: 116, endSec: 117 },
          { fileId: "f12", startSec: 5, endSec: 5 },
          { fileId: "unknown", startSec: 104, endSec: 106 },
          { fileId: "f11", startSec: 296, endSec: 296 },
        ],
        fileLectures,
      ),
    ).toEqual([true, true, false, true, false, true]);
  });
});

describe("attemptStatus", () => {
  it("separates passed, failed, and errored attempts", () => {
    expect([passed, retrievalMiss, timedOut].map(attemptStatus)).toEqual([
      "passed",
      "failed",
      "error",
    ]);
  });
});

describe("attemptFailureReasons", () => {
  it("says nothing for a passed attempt", () => {
    expect(attemptFailureReasons(passed)).toEqual([]);
  });

  it("names the missed evidence group, unsupported point, disallowed claim, and unsupported claims", () => {
    expect(attemptFailureReasons(retrievalMiss)).toEqual([
      "Evidence group 2 not cited (closest citation 40 s away)",
      "Required point not supported: second point",
      "Disallowed claim made: a wrong claim",
      "The answer makes claims the cited transcript does not support",
    ]);
  });

  it("names an evidence group with no citation in its lecture", () => {
    expect(
      attemptFailureReasons(
        attempt({
          score: {
            ...score(false),
            retrieval: { passed: false, groups: [{ hit: false, distanceSec: null }] },
          },
        }),
      ),
    ).toEqual(["Evidence group 1 not cited"]);
  });

  it("gives the failure reason and message", () => {
    expect(attemptFailureReasons(timedOut)).toEqual(["Timed out: The operation timed out."]);
    expect(
      attemptFailureReasons(
        attempt({ failure: { reason: "judge-error", name: "Error", message: "Jev returned 500" } }),
      ),
    ).toEqual(["Judge error: Jev returned 500"]);
    expect(
      attemptFailureReasons(
        attempt({ failure: { reason: "error", name: "Error", message: "Provider refused." } }),
      ),
    ).toEqual(["Agent error: Provider refused."]);
  });
});

describe("agentEvaluationTotals", () => {
  const result = {
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:02:30.000Z",
    attempts: [passed, retrievalMiss, timedOut],
    summary: {
      plannedAttempts: 6,
      completedAttempts: 3,
      passed: 1,
      retrievalPassed: 1,
      coveragePassed: 1,
      failures: { error: 0, timeout: 1, "judge-error": 0 },
      medianDistanceSec: 1,
      questions: [],
    },
  } satisfies Pick<AgentEvaluationResult, "attempts" | "summary" | "startedAt" | "finishedAt">;

  it("computes rates over completed attempts, pooled citation precision, and duration", () => {
    const totals = agentEvaluationTotals(result);
    expect(totals.passRate).toBeCloseTo(1 / 3);
    expect(totals.retrievalRate).toBeCloseTo(1 / 3);
    expect(totals.coverageRate).toBeCloseTo(1 / 3);
    // 2 of 2 citations hit, then 1 of 2.
    expect(totals.citationPrecision).toBeCloseTo(3 / 4);
    expect(totals.durationMs).toBe(150_000);
  });

  it("sums agent tokens from every attempt and Jev usage as reported", () => {
    const totals = agentEvaluationTotals(result);
    expect(totals.agentTokens).toEqual({ input: 1_500, output: 70, unknownAttempts: 1 });
    expect(totals.judgeUsage).toEqual({ input_tokens: 200, output_tokens: 8 });
  });

  it("counts the tokens of a failed attempt's Trace", () => {
    const withTrace = {
      ...timedOut,
      trace: { sessionId: "s", runId: "r", fallbackTrims: 0, tokens: { input: 9, output: 1 } },
    };
    expect(agentEvaluationTotals({ ...result, attempts: [withTrace] }).agentTokens).toEqual({
      input: 9,
      output: 1,
      unknownAttempts: 0,
    });
  });

  it("has no rates without completed attempts", () => {
    const totals = agentEvaluationTotals({ ...result, attempts: [] });
    expect(totals).toMatchObject({ passRate: null, citationPrecision: null });
  });
});

describe("groupAttemptsByQuestion", () => {
  it("groups attempts under each question in question order, sorted by attempt", () => {
    const other = attempt({ questionId: "q2", attempt: 2, passed: true });
    expect(
      groupAttemptsByQuestion(["q2", "q1", "q3"], [timedOut, other, passed, retrievalMiss]),
    ).toEqual([
      { questionId: "q2", passes: 1, attempts: [other] },
      { questionId: "q1", passes: 1, attempts: [passed, retrievalMiss, timedOut] },
      { questionId: "q3", passes: 0, attempts: [] },
    ]);
  });
});
