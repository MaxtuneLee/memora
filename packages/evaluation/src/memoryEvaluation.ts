import * as v from "valibot";

import type { AgentIdentity, AttemptTrace } from "./agentTypes";
import { AgentAttemptError, EvaluationError } from "./errors";
import { untilAborted } from "./runAgentEvaluation";
import {
  answerProse,
  issuesMessage,
  runTextChecks,
  TextCheckSchema,
  type TextCheck,
  type TextCheckResult,
} from "./textChecks";

const ATTEMPTS_PER_CASE = 3;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 5 * 60_000;
export const REMEMBER_TOOL = "remember_user_preference";
export const READ_SESSION_TOOL = "read_chat_session";

/** An earlier chat the agent can find with its session tools during a memory evaluation. */
export interface PastSession {
  sessionId: string;
  title: string;
  /** ISO time; sessions are listed newest first. */
  updatedAt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/** Whether the agent saves a stated preference, and what the saved notice says. */
export interface SaveCase {
  caseId: string;
  kind: "save";
  /** "change" changes or withdraws one of the case's saved notices. */
  category: "durable" | "change" | "one-off" | "profile-fact" | "sensitive";
  message: string;
  /** Preferences already saved when the message is sent; none when absent. */
  notices?: string[];
  expect: "save" | "skip";
  /**
   * Rules the saved notices must follow after the Run, the case's own included, checked on all of
   * them joined by line breaks.
   */
  noticeChecks?: TextCheck[];
}

/** Whether the agent finds and uses what was said in an earlier chat. */
export interface RecallCase {
  caseId: string;
  kind: "recall";
  category: "recall" | "latest" | "absent";
  message: string;
  /** The agent must read at least one of these sessions; empty when nothing should be found. */
  sessionIds: string[];
  checks: TextCheck[];
}

export type MemoryCase = SaveCase | RecallCase;

export interface MemoryCasesFile {
  sessions: PastSession[];
  cases: MemoryCase[];
}

const nonEmpty = v.pipe(v.string(), v.minLength(1));

const MemoryCasesFileSchema = v.pipe(
  v.object({
    sessions: v.array(
      v.object({
        sessionId: nonEmpty,
        title: nonEmpty,
        updatedAt: v.pipe(v.string(), v.isoTimestamp()),
        messages: v.pipe(
          v.array(v.object({ role: v.picklist(["user", "assistant"]), content: nonEmpty })),
          v.minLength(1),
        ),
      }),
    ),
    cases: v.pipe(
      v.array(
        v.variant("kind", [
          v.object({
            caseId: nonEmpty,
            kind: v.literal("save"),
            category: v.picklist(["durable", "change", "one-off", "profile-fact", "sensitive"]),
            message: nonEmpty,
            notices: v.optional(v.array(nonEmpty)),
            expect: v.picklist(["save", "skip"]),
            noticeChecks: v.optional(v.array(TextCheckSchema)),
          }),
          v.object({
            caseId: nonEmpty,
            kind: v.literal("recall"),
            category: v.picklist(["recall", "latest", "absent"]),
            message: nonEmpty,
            sessionIds: v.array(nonEmpty),
            checks: v.pipe(v.array(TextCheckSchema), v.minLength(1)),
          }),
        ]),
      ),
      v.minLength(1),
    ),
  }),
  v.check(
    ({ cases }) => new Set(cases.map((item) => item.caseId)).size === cases.length,
    "caseId values must be unique",
  ),
  v.check(
    ({ sessions, cases }) =>
      cases.every(
        (item) =>
          item.kind === "save" ||
          item.sessionIds.every((id) => sessions.some(({ sessionId }) => sessionId === id)),
      ),
    "recall sessionIds must name sessions in the file",
  ),
);

/** Validates a memory cases file and returns its sessions and cases. */
export function parseMemoryCases(data: unknown): MemoryCasesFile {
  const result = v.safeParse(MemoryCasesFileSchema, data);
  if (result.success) return result.output as MemoryCasesFile;
  throw new EvaluationError(
    "invalid-questions",
    `Invalid memory cases file. ${issuesMessage(result.issues)}`,
  );
}

export interface MemoryReply {
  answer: string;
  /** Every tool call of the Run, in order. */
  toolCalls: Array<{ name: string; args: unknown }>;
  /**
   * The saved notices after the Run: the case's own with the preference tool's changes applied.
   * Nothing reaches the user's real memory.
   */
  notices: string[];
  sessionId: string;
  runId: string | null;
  tokens?: { input: number; cached?: number; output: number };
  fallbackTrims: number | "unknown";
}

export interface MemoryAdapter {
  identity: AgentIdentity;
  /**
   * Answers one message in a fresh session that sees only the evaluation's past sessions, with
   * `notices` as the saved preferences.
   */
  converse(
    input: { caseId: string; message: string; notices?: string[] },
    signal: AbortSignal,
  ): Promise<MemoryReply>;
}

export interface MemoryAttemptResult {
  caseId: string;
  kind: MemoryCase["kind"];
  attempt: number;
  passed: boolean;
  latencyMs: number;
  reply?: MemoryReply;
  trace?: AttemptTrace;
  save?: {
    /** The agent called the preference tool. */
    called: boolean;
    /** The saved notices differ from the case's own after the Run. */
    stored: boolean;
    decisionCorrect: boolean;
    /** Checked only when a save was expected and made. */
    noticeChecks: TextCheckResult[];
  };
  recall?: { readSessionIds: string[]; readExpected: boolean; checks: TextCheckResult[] };
  failure?: { reason: "error" | "timeout"; name: string; message: string };
}

export interface MemoryEvaluationSummary {
  plannedAttempts: number;
  completedAttempts: number;
  passed: number;
  save: {
    attempts: number;
    passed: number;
    /** Agent decisions: called the tool when it should (true) or should not (false). */
    truePositive: number;
    falsePositive: number;
    falseNegative: number;
    trueNegative: number;
    /** Saves that were expected and made, and how many of those passed their notice checks. */
    noticeChecked: number;
    noticePassed: number;
  };
  recall: { attempts: number; passed: number; readExpected: number };
  failures: { error: number; timeout: number };
  cases: Array<{ caseId: string; passes: number; attempts: number }>;
}

export interface MemoryEvaluationResult {
  formatVersion: 1;
  kind: "memory";
  evaluationId: string;
  status: "completed" | "canceled";
  startedAt: string;
  finishedAt: string;
  agent: AgentIdentity;
  /** SHA-256 of the cases file. */
  revisions: { cases: string };
  config: { concurrency: number; attemptsPerCase: number; attemptTimeoutMs: number };
  cases: MemoryCase[];
  sessions: PastSession[];
  attempts: MemoryAttemptResult[];
  summary: MemoryEvaluationSummary;
}

export interface RunMemoryEvaluationOptions {
  cases: MemoryCase[];
  sessions: PastSession[];
  revisions: { cases: string };
  agent: MemoryAdapter;
  concurrency?: number;
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: {
    completed: number;
    total: number;
    attempt: MemoryAttemptResult;
  }) => void;
  now?: () => Date;
  createId?: () => string;
}

/** Every notice must be English, as the extractor is told; the case's own rules follow. */
const NOTICE_FORM: TextCheck = { type: "language", language: "en" };

export function scoreSaveCase(
  item: SaveCase,
  reply: Pick<MemoryReply, "toolCalls" | "notices">,
): NonNullable<MemoryAttemptResult["save"]> {
  const called = reply.toolCalls.some(({ name }) => name === REMEMBER_TOOL);
  const before = item.notices ?? [];
  const stored = [...reply.notices].sort().join("\n") !== [...before].sort().join("\n");
  const noticeChecks =
    item.expect === "save" && called
      ? stored
        ? [
            ...reply.notices
              .filter((notice) => !before.includes(notice))
              .flatMap((notice) =>
                runTextChecks(notice, [NOTICE_FORM]).map((check) => ({
                  ...check,
                  label: `Notice in English: ${notice}`,
                })),
              ),
            ...runTextChecks(reply.notices.join("\n"), item.noticeChecks ?? []),
          ]
        : [{ label: "Notice stored", passed: false, detail: "the saved notices did not change" }]
      : [];
  return { called, stored, decisionCorrect: called === (item.expect === "save"), noticeChecks };
}

export function scoreRecallCase(
  item: RecallCase,
  reply: Pick<MemoryReply, "toolCalls" | "answer">,
): NonNullable<MemoryAttemptResult["recall"]> {
  const readSessionIds = reply.toolCalls.flatMap(({ name, args }) => {
    const id = (args as { session_id?: unknown } | null)?.session_id;
    return name === READ_SESSION_TOOL && typeof id === "string" ? [id] : [];
  });
  return {
    readSessionIds,
    readExpected:
      item.sessionIds.length === 0 || item.sessionIds.some((id) => readSessionIds.includes(id)),
    checks: runTextChecks(answerProse(reply.answer), item.checks),
  };
}

/** Why a memory attempt did not pass, one line per cause; empty for a passed attempt. */
export function memoryAttemptReasons(item: MemoryCase, attempt: MemoryAttemptResult): string[] {
  if (attempt.passed) return [];
  const reasons: string[] = [];
  if (attempt.failure)
    reasons.push(
      `${attempt.failure.reason === "timeout" ? "Timed out" : "Agent error"}: ${attempt.failure.message}`,
    );
  if (attempt.save && !attempt.save.decisionCorrect)
    reasons.push(
      item.kind === "save" && item.expect === "save"
        ? "Did not save a lasting preference"
        : `Saved a ${item.category} message as a preference`,
    );
  if (attempt.recall && !attempt.recall.readExpected && item.kind === "recall")
    reasons.push(`Did not read ${item.sessionIds.join(" or ")}`);
  for (const check of [...(attempt.save?.noticeChecks ?? []), ...(attempt.recall?.checks ?? [])])
    if (!check.passed) reasons.push(`${check.label} failed (${check.detail})`);
  return reasons;
}

const buildSummary = (
  cases: MemoryCase[],
  attempts: MemoryAttemptResult[],
): MemoryEvaluationSummary => {
  const kindOf = new Map(cases.map((item) => [item.caseId, item]));
  const save = {
    attempts: 0,
    passed: 0,
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
    noticeChecked: 0,
    noticePassed: 0,
  };
  const recall = { attempts: 0, passed: 0, readExpected: 0 };
  const failures = { error: 0, timeout: 0 };
  for (const attempt of attempts) {
    if (attempt.failure) failures[attempt.failure.reason] += 1;
    const item = kindOf.get(attempt.caseId);
    if (item?.kind === "save") {
      save.attempts += 1;
      if (attempt.passed) save.passed += 1;
      if (!attempt.save) continue;
      const expected = item.expect === "save";
      if (attempt.save.called) save[expected ? "truePositive" : "falsePositive"] += 1;
      else save[expected ? "falseNegative" : "trueNegative"] += 1;
      if (attempt.save.noticeChecks.length) {
        save.noticeChecked += 1;
        if (attempt.save.noticeChecks.every((check) => check.passed)) save.noticePassed += 1;
      }
    } else if (item?.kind === "recall") {
      recall.attempts += 1;
      if (attempt.passed) recall.passed += 1;
      if (attempt.recall?.readExpected) recall.readExpected += 1;
    }
  }
  return {
    plannedAttempts: cases.length * ATTEMPTS_PER_CASE,
    completedAttempts: attempts.length,
    passed: attempts.filter((attempt) => attempt.passed).length,
    save,
    recall,
    failures,
    cases: cases.map(({ caseId }) => {
      const own = attempts.filter((attempt) => attempt.caseId === caseId);
      return {
        caseId,
        passes: own.filter((attempt) => attempt.passed).length,
        attempts: own.length,
      };
    }),
  };
};

class Canceled extends Error {}

/**
 * Runs every case three times. A save case passes when the agent calls the preference tool exactly
 * when it should and, for a lasting preference, the saved notice follows the case's rules. A recall
 * case passes when the agent read one of the expected past sessions and the answer follows the
 * case's rules. Everything is checked by code; there is no judge.
 */
export async function runMemoryEvaluation(
  options: RunMemoryEvaluationOptions,
): Promise<MemoryEvaluationResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError("Concurrency must be a positive integer.");
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const outer = options.signal ?? new AbortController().signal;

  const runAttempt = async (item: MemoryCase, attempt: number): Promise<MemoryAttemptResult> => {
    const signal = AbortSignal.any([outer, AbortSignal.timeout(attemptTimeoutMs)]);
    const started = performance.now();
    let reply: MemoryReply;
    try {
      reply = await untilAborted(
        options.agent.converse(
          {
            caseId: item.caseId,
            message: item.message,
            ...(item.kind === "save" && item.notices ? { notices: item.notices } : {}),
          },
          signal,
        ),
        signal,
      );
    } catch (error) {
      if (outer.aborted) throw new Canceled();
      return {
        caseId: item.caseId,
        kind: item.kind,
        attempt,
        passed: false,
        latencyMs: performance.now() - started,
        ...(error instanceof AgentAttemptError ? { trace: error.trace } : {}),
        failure: {
          reason: signal.aborted ? "timeout" : "error",
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    const latencyMs = performance.now() - started;
    if (item.kind === "save") {
      const save = scoreSaveCase(item, reply);
      return {
        caseId: item.caseId,
        kind: item.kind,
        attempt,
        passed: save.decisionCorrect && save.noticeChecks.every((check) => check.passed),
        latencyMs,
        reply,
        save,
      };
    }
    const recall = scoreRecallCase(item, reply);
    return {
      caseId: item.caseId,
      kind: item.kind,
      attempt,
      passed: recall.readExpected && recall.checks.every((check) => check.passed),
      latencyMs,
      reply,
      recall,
    };
  };

  const tasks = options.cases.flatMap((item) =>
    Array.from({ length: ATTEMPTS_PER_CASE }, (_, index) => ({ item, attempt: index + 1 })),
  );
  const slots: Array<MemoryAttemptResult | undefined> = Array.from({ length: tasks.length });
  let next = 0;
  let completed = 0;
  const worker = async () => {
    while (next < tasks.length && !outer.aborted) {
      const index = next++;
      try {
        slots[index] = await runAttempt(tasks[index].item, tasks[index].attempt);
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
    kind: "memory",
    evaluationId: options.createId?.() ?? crypto.randomUUID(),
    status: outer.aborted ? "canceled" : "completed",
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    agent: options.agent.identity,
    revisions: options.revisions,
    config: { concurrency, attemptsPerCase: ATTEMPTS_PER_CASE, attemptTimeoutMs },
    cases: options.cases,
    sessions: options.sessions,
    attempts,
    summary: buildSummary(options.cases, attempts),
  };
}
