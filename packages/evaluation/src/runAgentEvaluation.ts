import { AGENT_SCORER_VERSION, CITATION_TOLERANCE_SEC, median, scoreCitations } from "./agentScore";
import { AgentAttemptError } from "./errors";
import type {
  AgentAnswer,
  AgentAttemptResult,
  AgentEvaluationResult,
  AgentEvaluationSummary,
  AttemptFailureReason,
  EvaluationQuestion,
  JudgeInput,
  JudgeVerdict,
  RunAgentEvaluationOptions,
} from "./agentTypes";

const ATTEMPTS_PER_QUESTION = 3;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_TRACE_WAIT_MS = 10_000;
/** Transcript the judge sees on each side of a citation, so a claim just outside it still counts. */
export const JUDGE_CONTEXT_SEC = 30;
/** Decisions this close to 50/50 neither pass nor fail an attempt; it is counted as uncertain. */
export const UNCERTAIN_CONFIDENCE = 0.6;

class Canceled extends Error {}

/** Settles with the promise, or rejects as soon as the signal aborts, even if the adapter ignores it. */
const untilAborted = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });

/**
 * Coverage from the gating decisions: every required point supported and no disallowed claim.
 * Unsupported claims are reported but do not gate. A missing decision counts against the answer,
 * so a short verdict cannot pass; a gating decision under `UNCERTAIN_CONFIDENCE` makes it uncertain.
 */
export const coverageOutcome = (
  question: EvaluationQuestion,
  verdict: JudgeVerdict,
): "passed" | "failed" | "uncertain" => {
  const decisions = [
    ...question.requiredPoints.map((_, index) => {
      const decision = verdict.requiredPoints[index];
      return decision && { ok: decision.supported, confidence: decision.confidence };
    }),
    ...(question.disallowedClaims ?? []).map((_, index) => {
      const decision = verdict.disallowedClaims[index];
      return decision && { ok: !decision.present, confidence: decision.confidence };
    }),
  ];
  if (
    decisions.some(
      (decision) => !decision || (!decision.ok && decision.confidence >= UNCERTAIN_CONFIDENCE),
    )
  )
    return "failed";
  return decisions.every((decision) => decision && decision.confidence >= UNCERTAIN_CONFIDENCE)
    ? "passed"
    : "uncertain";
};

const citedCues = (
  answer: AgentAnswer,
  corpus: RunAgentEvaluationOptions["corpus"],
): JudgeInput["citedCues"] => {
  const cues = new Map<string, JudgeInput["citedCues"][number]>();
  for (const citation of answer.citations) {
    const lectureId = corpus.fileLectures[citation.fileId];
    if (lectureId === undefined) continue;
    const startMs = (citation.startSec - JUDGE_CONTEXT_SEC) * 1000;
    const endMs = (citation.endSec + JUDGE_CONTEXT_SEC) * 1000;
    for (const cue of corpus.cues[lectureId] ?? []) {
      if (cue.startMs > endMs || cue.endMs < startMs) continue;
      cues.set(`${lectureId}\u0000${cue.cueId}`, { ...cue, lectureId });
    }
  }
  return [...cues.values()];
};

const buildSummary = (
  questions: EvaluationQuestion[],
  attempts: AgentAttemptResult[],
): AgentEvaluationSummary => {
  const failures: Record<AttemptFailureReason, number> = { error: 0, timeout: 0, "judge-error": 0 };
  for (const attempt of attempts) if (attempt.failure) failures[attempt.failure.reason] += 1;
  return {
    plannedAttempts: questions.length * ATTEMPTS_PER_QUESTION,
    completedAttempts: attempts.length,
    passed: attempts.filter((attempt) => attempt.passed).length,
    retrievalPassed: attempts.filter((attempt) => attempt.score?.retrieval.passed).length,
    coveragePassed: attempts.filter((attempt) => attempt.coverage?.passed).length,
    uncertain: attempts.filter((attempt) => attempt.uncertain).length,
    failures,
    medianDistanceSec: median(
      attempts.flatMap((attempt) =>
        (attempt.score?.retrieval.groups ?? []).flatMap((group) =>
          group.distanceSec === null ? [] : [group.distanceSec],
        ),
      ),
    ),
    questions: questions.map(({ questionId }) => {
      const own = attempts.filter((attempt) => attempt.questionId === questionId);
      return {
        questionId,
        passes: own.filter((attempt) => attempt.passed).length,
        attempts: own.length,
      };
    }),
  };
};

/**
 * Runs every question three times against the agent, scores citations deterministically,
 * and judges coverage. Failed and timed-out attempts stay in the result; canceled ones are dropped.
 */
export async function runAgentEvaluation(
  options: RunAgentEvaluationOptions,
): Promise<AgentEvaluationResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError("Concurrency must be a positive integer.");
  if (!Number.isFinite(attemptTimeoutMs) || attemptTimeoutMs <= 0)
    throw new RangeError("The attempt timeout must be a positive number.");
  const traceWaitMs = options.traceWaitMs ?? DEFAULT_TRACE_WAIT_MS;
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const outer = options.signal ?? new AbortController().signal;
  const { corpus, agent, judge } = options;

  const runAttempt = async (
    question: EvaluationQuestion,
    attempt: number,
  ): Promise<AgentAttemptResult> => {
    const signal = AbortSignal.any([outer, AbortSignal.timeout(attemptTimeoutMs)]);
    const failed = (
      stage: "agent" | "judge",
      error: unknown,
      rest: Partial<AgentAttemptResult>,
    ): AgentAttemptResult => {
      if (outer.aborted) throw new Canceled();
      const reason: AttemptFailureReason = signal.aborted
        ? "timeout"
        : stage === "judge"
          ? "judge-error"
          : "error";
      return {
        questionId: question.questionId,
        attempt,
        passed: false,
        latencyMs: 0,
        ...rest,
        failure: {
          reason,
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    };

    const started = performance.now();
    let answer: AgentAnswer;
    const answering = agent.answer(
      { questionId: question.questionId, question: question.question },
      signal,
    );
    try {
      answer = await untilAborted(answering, signal);
    } catch (error) {
      const latencyMs = performance.now() - started;
      // A timed-out adapter still deletes its session and reads the Trace; wait for that briefly.
      const reported =
        !signal.aborted || outer.aborted
          ? error
          : await Promise.race([
              answering.then(
                () => undefined,
                (late: unknown) => late,
              ),
              new Promise<undefined>((resolve) => setTimeout(resolve, traceWaitMs)),
            ]);
      return failed("agent", error, {
        latencyMs,
        ...(reported instanceof AgentAttemptError ? { trace: reported.trace } : {}),
      });
    }
    const latencyMs = performance.now() - started;
    const score = scoreCitations(question, answer.citations, corpus.fileLectures);
    let verdict: JudgeVerdict;
    try {
      verdict = await untilAborted(
        judge.judge(
          {
            question: question.question,
            requiredPoints: question.requiredPoints,
            disallowedClaims: question.disallowedClaims ?? [],
            citedCues: citedCues(answer, corpus),
            lectureNames: corpus.lectureNames ?? {},
            answer: answer.answer,
          },
          signal,
        ),
        signal,
      );
    } catch (error) {
      return failed("judge", error, { latencyMs, answer, score });
    }
    const outcome = coverageOutcome(question, verdict);
    const uncertain = score.retrieval.passed && outcome === "uncertain";
    return {
      questionId: question.questionId,
      attempt,
      passed: score.retrieval.passed && outcome === "passed",
      ...(uncertain ? { uncertain } : {}),
      latencyMs,
      answer,
      score,
      coverage: { passed: outcome === "passed", verdict },
    };
  };

  const tasks = options.questions.flatMap((question) =>
    Array.from({ length: ATTEMPTS_PER_QUESTION }, (_, index) => ({ question, attempt: index + 1 })),
  );
  const slots: Array<AgentAttemptResult | undefined> = Array.from({ length: tasks.length });
  let next = 0;
  let completed = 0;
  const worker = async () => {
    while (next < tasks.length && !outer.aborted) {
      const index = next++;
      const { question, attempt } = tasks[index];
      try {
        slots[index] = await runAttempt(question, attempt);
      } catch (error) {
        if (error instanceof Canceled) return;
        throw error;
      }
      completed += 1;
      options.onProgress?.({ completed, total: tasks.length, attempt: slots[index] });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));

  const attempts = slots.filter((slot) => slot !== undefined);
  return {
    formatVersion: 1,
    kind: "agent",
    evaluationId: options.createId?.() ?? crypto.randomUUID(),
    status: outer.aborted ? "canceled" : "completed",
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    agent: agent.identity,
    judge: judge.identity,
    revisions: corpus.revisions,
    config: {
      scorerVersion: AGENT_SCORER_VERSION,
      concurrency,
      attemptsPerQuestion: ATTEMPTS_PER_QUESTION,
      attemptTimeoutMs,
      toleranceSec: CITATION_TOLERANCE_SEC,
    },
    questions: options.questions,
    fileLectures: corpus.fileLectures,
    attempts,
    summary: buildSummary(options.questions, attempts),
  };
}
