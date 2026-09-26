import { describe, expect, it } from "vitest";

import {
  readAgentEvaluationResult,
  runAgentEvaluation,
  saveAgentEvaluationResult,
  type AgentAdapter,
  type AgentAnswer,
  type AgentCitation,
  type AgentEvaluationCorpus,
  type EvaluationQuestion,
  type JudgeAdapter,
  type JudgeInput,
  type JudgeVerdict,
} from "../src/index";
import { MemoryResultStorage } from "./fixtures";

const LEC11 = "eval-aaaaaaaaaaaa-lec11";
const LEC12 = "eval-bbbbbbbbbbbb-lec12";

const corpus: AgentEvaluationCorpus = {
  fileLectures: { [LEC11]: "lec11", [LEC12]: "lec12" },
  cues: {
    lec11: [
      { cueId: "11-1", startMs: 0, endMs: 3_000, text: " opening" },
      { cueId: "11-40", startMs: 100_000, endMs: 103_000, text: " autoencoders compress" },
      { cueId: "11-41", startMs: 103_000, endMs: 106_000, text: " the bottleneck" },
    ],
    lec12: [{ cueId: "12-90", startMs: 400_000, endMs: 404_000, text: " contrastive loss" }],
  },
  revisions: {
    questions: "sha-questions",
    transcripts: { lec11: "sha-11", lec12: "sha-12" },
    transcriptVersion: "1",
    converterVersion: "1",
  },
};

const window = (lectureId: string, startMs: number, endMs: number) => ({
  lectureId,
  startCueId: `${lectureId}-${startMs}`,
  endCueId: `${lectureId}-${endMs}`,
  startMs,
  endMs,
});

const question = (questionId: string, overrides: Partial<EvaluationQuestion> = {}) =>
  ({
    questionId,
    question: `What does ${questionId} ask?`,
    lectureIds: ["lec11"],
    evidence: [[window("lec11", 100_000, 110_000)]],
    requiredPoints: ["point"],
    kind: "localized",
    ...overrides,
  }) satisfies EvaluationQuestion;

const cite = (fileId: string, startSec: number, endSec = startSec): AgentCitation => ({
  fileId,
  startSec,
  endSec,
});

const answer = (citations: AgentCitation[]): AgentAnswer => ({
  answer: "An answer.",
  citations,
  sessionId: "eval-session",
  runId: "run-1",
  usage: { inputTokens: 10, outputTokens: 5 },
  fallbackTrims: 0,
});

const agentIdentity = {
  adapter: "fake",
  model: "fake-model",
  promptRevision: "prompt-1",
  tools: ["search_transcript"],
  settings: { personality: "none", notices: "none" },
};

const agent = (
  reply: (questionId: string, signal: AbortSignal) => Promise<AgentAnswer> | AgentAnswer,
): AgentAdapter => ({
  identity: agentIdentity,
  answer: async ({ questionId }, signal) => reply(questionId, signal),
});

const supported = (input: JudgeInput): JudgeVerdict => ({
  requiredPoints: input.requiredPoints.map((point) => ({
    point,
    supported: true,
    confidence: 0.9,
  })),
  disallowedClaims: input.disallowedClaims.map((claim) => ({
    claim,
    present: false,
    confidence: 0.8,
  })),
  unsupportedClaims: { present: false, confidence: 0.7 },
  rawOutput: '{"ok":true}',
});

const judge = (
  decide: (input: JudgeInput) => Promise<JudgeVerdict> | JudgeVerdict = supported,
): JudgeAdapter & { inputs: JudgeInput[] } => {
  const inputs: JudgeInput[] = [];
  return {
    inputs,
    identity: { judge: "fake-judge", model: "fake-jev", promptVersion: "judge-1" },
    judge: async (input) => {
      inputs.push(input);
      return decide(input);
    },
  };
};

const byQuestion = <T extends { questionId: string }>(items: T[], questionId: string) =>
  items.filter((item) => item.questionId === questionId);

describe("runAgentEvaluation", () => {
  it("runs three attempts per question and reports progress out of questions × 3", async () => {
    const progress: Array<[number, number]> = [];
    const result = await runAgentEvaluation({
      questions: [question("q1"), question("q2")],
      corpus,
      agent: agent(() => answer([cite(LEC11, 101, 104)])),
      judge: judge(),
      onProgress: ({ completed, total }) => progress.push([completed, total]),
    });

    expect(result.status).toBe("completed");
    expect(result.attempts.map((attempt) => [attempt.questionId, attempt.attempt])).toEqual([
      ["q1", 1],
      ["q1", 2],
      ["q1", 3],
      ["q2", 1],
      ["q2", 2],
      ["q2", 3],
    ]);
    expect(progress.at(-1)).toEqual([6, 6]);
    expect(progress.every(([, total]) => total === 6)).toBe(true);
    expect(result.summary).toMatchObject({ plannedAttempts: 6, completedAttempts: 6, passed: 6 });
    expect(result.summary.questions).toEqual([
      { questionId: "q1", passes: 3, attempts: 3 },
      { questionId: "q2", passes: 3, attempts: 3 },
    ]);
  });

  it("never runs more attempts at once than the concurrency limit (default 3)", async () => {
    const measure = async (concurrency?: number) => {
      let running = 0;
      let peak = 0;
      const result = await runAgentEvaluation({
        questions: [question("q1"), question("q2"), question("q3")],
        corpus,
        concurrency,
        agent: agent(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running -= 1;
          return answer([]);
        }),
        judge: judge(),
      });
      return { peak, result };
    };

    const limited = await measure(2);
    expect(limited.peak).toBe(2);
    expect(limited.result.attempts).toHaveLength(9);
    expect(limited.result.config.concurrency).toBe(2);

    const byDefault = await measure();
    expect(byDefault.peak).toBe(3);
    expect(byDefault.result.config.concurrency).toBe(3);
  });

  it("stops new attempts and aborts in-flight ones when canceled", async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const result = await runAgentEvaluation({
      questions: [question("q1"), question("q2")],
      corpus,
      concurrency: 2,
      signal: controller.signal,
      agent: agent((_, signal) => {
        signals.push(signal);
        if (signals.length === 2) controller.abort();
        return new Promise<AgentAnswer>(() => {});
      }),
      judge: judge(),
    });

    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(result.status).toBe("canceled");
    expect(result.attempts).toEqual([]);
    expect(result.summary).toMatchObject({ plannedAttempts: 6, completedAttempts: 0 });
  });

  it("counts errors and timeouts as failures with reasons in the denominator", async () => {
    const calls = new Map<string, number>();
    const result = await runAgentEvaluation({
      questions: [question("flaky"), question("judged")],
      corpus,
      attemptTimeoutMs: 20,
      agent: agent((questionId) => {
        const call = (calls.get(questionId) ?? 0) + 1;
        calls.set(questionId, call);
        if (questionId === "flaky" && call === 1) throw new Error("provider unavailable");
        // Ignores the signal on purpose: the runner must still time the attempt out.
        if (questionId === "flaky" && call === 2) return new Promise<AgentAnswer>(() => {});
        return answer([cite(LEC11, 101, 104)]);
      }),
      judge: judge((input) => {
        if (input.question.includes("judged")) throw new Error("judge rate limited");
        return supported(input);
      }),
    });

    const flaky = byQuestion(result.attempts, "flaky");
    expect(flaky.map((attempt) => attempt.failure?.reason)).toEqual([
      "error",
      "timeout",
      undefined,
    ]);
    expect(flaky[0].failure?.message).toBe("provider unavailable");
    expect(byQuestion(result.attempts, "judged")[0]).toMatchObject({
      passed: false,
      failure: { reason: "judge-error", message: "judge rate limited" },
      score: { retrieval: { passed: true } },
    });
    expect(result.summary.failures).toEqual({ error: 1, timeout: 1, "judge-error": 3 });
    expect(result.summary.questions).toEqual([
      { questionId: "flaky", passes: 1, attempts: 3 },
      { questionId: "judged", passes: 0, attempts: 3 },
    ]);
  });

  it("scores grouped evidence with alternatives, timestamp distance, and citation precision", async () => {
    const twoSegment = question("two", {
      kind: "two-segment",
      lectureIds: ["lec11", "lec12"],
      evidence: [
        [window("lec11", 100_000, 110_000)],
        [window("lec12", 200_000, 210_000), window("lec12", 400_000, 405_000)],
      ],
    });
    const judged = judge();
    const result = await runAgentEvaluation({
      questions: [twoSegment],
      corpus,
      // Hits the first group, the second group's alternative window, and one stray citation.
      agent: agent(() => answer([cite(LEC11, 101, 104), cite(LEC12, 402), cite(LEC11, 1)])),
      judge: judged,
    });

    expect(result.attempts[0]).toMatchObject({
      passed: true,
      score: {
        retrieval: {
          passed: true,
          groups: [
            { hit: true, distanceSec: 0 },
            { hit: true, distanceSec: 0 },
          ],
        },
        timestamp: { medianDistanceSec: 0, withinToleranceShare: 1, uncitedGroups: 0 },
      },
    });
    expect(result.attempts[0].score?.citationPrecision).toBeCloseTo(2 / 3);
    expect(judged.inputs[0].citedCues.map((cue) => cue.cueId)).toEqual([
      "11-40",
      "11-41",
      "12-90",
      "11-1",
    ]);
  });

  it("applies the 5 s tolerance at the boundary and keeps missing citations apart", async () => {
    const answers: Record<string, AgentCitation[]> = {
      inside: [cite(LEC11, 115)], // 5 s after the window ends
      before: [cite(LEC11, 94, 95)], // 5 s before it starts
      outside: [cite(LEC11, 116)], // 6 s after
      wrongLecture: [cite(LEC12, 105)],
      none: [],
    };
    const result = await runAgentEvaluation({
      questions: Object.keys(answers).map((id) => question(id)),
      corpus,
      agent: agent((questionId) => answer(answers[questionId])),
      judge: judge(),
    });
    const score = (questionId: string) => byQuestion(result.attempts, questionId)[0].score;

    expect(score("inside")).toMatchObject({
      retrieval: { passed: true, groups: [{ hit: true, distanceSec: 5 }] },
      timestamp: { withinToleranceShare: 1 },
      citationPrecision: 1,
    });
    expect(score("before")?.retrieval.passed).toBe(true);
    expect(score("outside")).toMatchObject({
      retrieval: { passed: false, groups: [{ hit: false, distanceSec: 6 }] },
      timestamp: { medianDistanceSec: 6, withinToleranceShare: 0, uncitedGroups: 0 },
      citationPrecision: 0,
    });
    expect(score("wrongLecture")).toMatchObject({
      retrieval: { passed: false, groups: [{ hit: false, distanceSec: null }] },
      timestamp: { medianDistanceSec: null, withinToleranceShare: null, uncitedGroups: 1 },
      citationPrecision: 0,
    });
    expect(score("none")).toMatchObject({
      retrieval: { passed: false },
      timestamp: { medianDistanceSec: null, uncitedGroups: 1 },
      citationPrecision: null,
    });
    expect(byQuestion(result.attempts, "none")[0].passed).toBe(false);
  });

  it("fails coverage on a disallowed claim, an unsupported claim, or a missing decision", async () => {
    const verdicts: Record<string, (input: JudgeInput) => JudgeVerdict> = {
      disallowed: (input) => ({
        ...supported(input),
        disallowedClaims: [{ claim: "wrong", present: true, confidence: 0.6 }],
      }),
      unsupported: (input) => ({
        ...supported(input),
        unsupportedClaims: { present: true, confidence: 0.55 },
      }),
      short: (input) => ({ ...supported(input), requiredPoints: [] }),
    };
    const result = await runAgentEvaluation({
      questions: Object.keys(verdicts).map((id) =>
        question(id, { requiredPoints: ["a", "b"], disallowedClaims: ["wrong"] }),
      ),
      corpus,
      agent: agent(() => answer([cite(LEC11, 101)])),
      judge: judge((input) => verdicts[input.question.split(" ")[2]](input)),
    });

    for (const attempt of result.attempts) {
      expect(attempt).toMatchObject({
        passed: false,
        score: { retrieval: { passed: true } },
        coverage: { passed: false },
      });
    }
    expect(result.summary).toMatchObject({ retrievalPassed: 9, coveragePassed: 0, passed: 0 });
  });

  it("stores the result with pinned revisions and judge records in its own directory", async () => {
    const storage = new MemoryResultStorage();
    const result = await runAgentEvaluation({
      questions: [question("q1")],
      corpus,
      agent: agent(() => answer([cite(LEC11, 101)])),
      judge: judge(),
      createId: () => "eval-1",
    });
    await saveAgentEvaluationResult(result, { storage });

    expect([...storage.files.keys()]).toEqual(["/memora/agent-evaluations/eval-1.json"]);
    const read = await readAgentEvaluationResult("eval-1", { storage });
    expect(read).toEqual(result);
    expect(read).toMatchObject({
      kind: "agent",
      evaluationId: "eval-1",
      revisions: corpus.revisions,
      agent: agentIdentity,
      judge: { judge: "fake-judge", model: "fake-jev", promptVersion: "judge-1" },
      config: { scorerVersion: 1, attemptsPerQuestion: 3, toleranceSec: 5 },
    });
    expect(read.attempts[0]).toMatchObject({
      answer: { sessionId: "eval-session", runId: "run-1", fallbackTrims: 0 },
      coverage: {
        verdict: {
          rawOutput: '{"ok":true}',
          requiredPoints: [{ point: "point", supported: true, confidence: 0.9 }],
          unsupportedClaims: { present: false, confidence: 0.7 },
        },
      },
    });
    await expect(readAgentEvaluationResult("missing", { storage })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
