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
export const SHOW_WIDGET_TOOL = "show_widget";
/** Tools that read the user's library; calling one counts as grounding the lesson. */
export const LIBRARY_TOOLS = [
  "read_file",
  "grep_files",
  "search_files",
  "read_extracted_content",
] as const;

type Range = [min: number, max: number];

/**
 * A rule a learning-mode reply must follow. Text checks read the reply prose; the rest read the
 * last accepted `show_widget` call (the lesson) or the reply's shape.
 */
export type LessonCheck =
  | TextCheck
  /** Accepted `show_widget` calls. */
  | { type: "widgets"; count: Range }
  | {
      type: "quiz";
      tasks?: Range;
      choices?: Range;
      /** Tasks and choices together. */
      questions?: Range;
      nextPart?: "set" | "absent";
      /** Every question names the roadmap part it tests (a final review). */
      partOnEveryQuestion?: boolean;
      /** Pattern the quiz title must match (flags `i`). */
      title?: string;
      /** Prompts of an earlier lesson that no new question may repeat. */
      notRepeating?: string[];
    }
  /** A numbered list of 2–6 items: the parts of a roadmap. */
  | { type: "roadmap" }
  /** At least one library tool call. */
  | { type: "readLibrary" };

export interface LearningCase {
  caseId: string;
  category: "small" | "large" | "prerequisite" | "no-lesson" | "result";
  /** Earlier turns the session starts with, as plain text. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  checks: LessonCheck[];
  /** Report-only: counted and shown, never fails the case. */
  report?: boolean;
}

const nonEmpty = v.pipe(v.string(), v.minLength(1));
const RangeSchema = v.pipe(
  v.tuple([v.pipe(v.number(), v.integer()), v.pipe(v.number(), v.integer())]),
  v.check(([min, max]) => min >= 0 && min <= max, "range must be [min, max] with 0 ≤ min ≤ max"),
);

const LessonCheckSchema: v.GenericSchema<unknown, LessonCheck> = v.union([
  TextCheckSchema,
  v.object({ type: v.literal("widgets"), count: RangeSchema }),
  v.object({
    type: v.literal("quiz"),
    tasks: v.optional(RangeSchema),
    choices: v.optional(RangeSchema),
    questions: v.optional(RangeSchema),
    nextPart: v.optional(v.picklist(["set", "absent"])),
    partOnEveryQuestion: v.optional(v.boolean()),
    title: v.optional(nonEmpty),
    notRepeating: v.optional(v.array(nonEmpty)),
  }),
  v.object({ type: v.literal("roadmap") }),
  v.object({ type: v.literal("readLibrary") }),
]);

const LearningCasesFileSchema = v.pipe(
  v.object({
    cases: v.pipe(
      v.array(
        v.object({
          caseId: nonEmpty,
          category: v.picklist(["small", "large", "prerequisite", "no-lesson", "result"]),
          history: v.optional(
            v.array(v.object({ role: v.picklist(["user", "assistant"]), content: nonEmpty })),
          ),
          message: nonEmpty,
          checks: v.pipe(v.array(LessonCheckSchema), v.minLength(1)),
          report: v.optional(v.boolean()),
        }),
      ),
      v.minLength(1),
    ),
  }),
  v.check(
    ({ cases }) => new Set(cases.map((item) => item.caseId)).size === cases.length,
    "caseId values must be unique",
  ),
);

/** Validates a learning cases file and returns its cases. */
export function parseLearningCases(data: unknown): LearningCase[] {
  const result = v.safeParse(LearningCasesFileSchema, data);
  if (result.success) return result.output.cases as LearningCase[];
  throw new EvaluationError(
    "invalid-questions",
    `Invalid learning cases file. ${issuesMessage(result.issues)}`,
  );
}

export interface LearningReply {
  answer: string;
  /** Every tool call of the Run, in order; `error` is set when the tool refused the call. */
  toolCalls: Array<{ name: string; args: unknown; error?: string }>;
  sessionId: string;
  runId: string | null;
  tokens?: { input: number; cached?: number; output: number };
  fallbackTrims: number | "unknown";
}

export interface LearningAdapter {
  identity: AgentIdentity;
  /** Answers one message, with learning mode on, in a fresh session seeded with `history`. */
  converse(
    input: { caseId: string; message: string; history: NonNullable<LearningCase["history"]> },
    signal: AbortSignal,
  ): Promise<LearningReply>;
}

/** What the lesson widget asks, read from its `lesson.quiz` code. */
export interface LessonFacts {
  widgets: number;
  rejectedWidgets: number;
  tasks: number;
  choices: number;
  title?: string;
  nextPart?: string;
  /** Questions with a `part:` key. */
  withPart: number;
  prompts: string[];
  /**
   * Report only: choice questions whose correct answer is more than a fifth longer than every wrong
   * option (the rule `show_widget` refuses since L3).
   */
  longestAnswerChoices: number;
}

const STRING = String.raw`(["'\x60])((?:\\.|(?!\1)[^\\])*)\1`;
const stringAfter = (code: string, key: string): string | undefined =>
  new RegExp(String.raw`\b${key}\s*:\s*${STRING}`).exec(code)?.[2];
const stringsAfter = (code: string, key: string): string[] =>
  [...code.matchAll(new RegExp(String.raw`\b${key}\s*:\s*${STRING}`, "g"))].map((m) => m[2]);

/**
 * Reads the quiz from the last accepted widget by pattern, not by running it.
 * ponytail: regex over the source, so a quiz built in a loop or from variables is undercounted;
 * run the widget in a page (layer 2) if that starts to matter.
 */
export function lessonFacts(reply: Pick<LearningReply, "toolCalls">): LessonFacts {
  const calls = reply.toolCalls.filter(({ name }) => name === SHOW_WIDGET_TOOL);
  const accepted = calls.filter(({ error }) => !error);
  const code = (accepted.at(-1)?.args as { widget_code?: unknown } | undefined)?.widget_code ?? "";
  const source = typeof code === "string" ? code : "";
  // Each question's object runs from its `.task(`/`.choice(` to the next one.
  const questions = [...source.matchAll(/\.(task|choice)\(\s*\{/g)].map((match, index, all) => ({
    kind: match[1],
    body: source.slice(match.index, all[index + 1]?.index ?? source.length),
  }));
  // The quiz options sit between `lesson.quiz(` and the first question.
  const quizStart = source.indexOf("lesson.quiz(");
  const firstQuestion = source.search(/\.(task|choice)\(\s*\{/);
  // `labels` has its own `nextPart` (the button text), so it is left out.
  const quizOptions = (
    quizStart < 0
      ? ""
      : source.slice(quizStart, firstQuestion > quizStart ? firstQuestion : undefined)
  ).replace(/\blabels\s*:\s*\{[^}]*\}/, "");
  return {
    widgets: accepted.length,
    rejectedWidgets: calls.length - accepted.length,
    tasks: questions.filter(({ kind }) => kind === "task").length,
    choices: questions.filter(({ kind }) => kind === "choice").length,
    title: stringAfter(quizOptions, "title"),
    nextPart: stringAfter(quizOptions, "nextPart"),
    withPart: questions.filter(({ body }) => /\bpart\s*:/.test(body)).length,
    prompts: questions.flatMap(({ body }) => stringAfter(body, "prompt") ?? []),
    longestAnswerChoices: questions.filter(({ kind, body }) => {
      if (kind !== "choice") return false;
      const answer = stringAfter(body, "answer");
      const wrong = stringsAfter(body, "text");
      return (
        answer !== undefined &&
        wrong.length > 0 &&
        answer.length > Math.max(...wrong.map((w) => w.length)) * 1.2
      );
    }).length,
  };
}

const NUMBERED_ITEM = /^\s*(?:\d+[.)、]|第\s*\d+\s*[部步])\s*\S/gm;
const normalize = (text: string) => text.toLowerCase().replace(/[\s\p{P}]+/gu, "");
const inRange = (value: number, [min, max]: Range) => value >= min && value <= max;
const rangeText = ([min, max]: Range) => (min === max ? `${min}` : `${min}–${max}`);

export function scoreLearningReply(
  checks: LessonCheck[],
  reply: Pick<LearningReply, "answer" | "toolCalls">,
): { facts: LessonFacts; checks: TextCheckResult[] } {
  const facts = lessonFacts(reply);
  const prose = answerProse(reply.answer);
  // An empty reply would pass "no widget" and word limits, so every case requires some text.
  const nonEmpty: TextCheckResult = {
    label: "Reply is not empty",
    passed: reply.answer.trim() !== "",
    detail: `${reply.answer.trim().length} characters`,
  };
  const results = checks.flatMap((check): TextCheckResult[] => {
    switch (check.type) {
      case "widgets":
        return [
          {
            label: `${rangeText(check.count)} lesson widgets`,
            passed: inRange(facts.widgets, check.count),
            detail: `${facts.widgets} accepted, ${facts.rejectedWidgets} refused`,
          },
        ];
      case "quiz": {
        const out: TextCheckResult[] = [];
        const count = (label: string, value: number, range?: Range) =>
          range &&
          out.push({
            label: `${rangeText(range)} ${label}`,
            passed: inRange(value, range),
            detail: `${value}`,
          });
        count("tasks", facts.tasks, check.tasks);
        count("choices", facts.choices, check.choices);
        count("questions", facts.tasks + facts.choices, check.questions);
        if (check.nextPart)
          out.push({
            label: `nextPart ${check.nextPart}`,
            passed: (facts.nextPart !== undefined) === (check.nextPart === "set"),
            detail: facts.nextPart ?? "absent",
          });
        if (check.partOnEveryQuestion)
          out.push({
            label: "Every question names its part",
            passed: facts.withPart === facts.tasks + facts.choices && facts.withPart > 0,
            detail: `${facts.withPart} of ${facts.tasks + facts.choices}`,
          });
        if (check.title)
          out.push({
            label: `Title matches /${check.title}/`,
            passed: new RegExp(check.title, "i").test(facts.title ?? ""),
            detail: facts.title ?? "no title",
          });
        if (check.notRepeating) {
          const earlier = check.notRepeating.map(normalize);
          const repeated = facts.prompts.filter((prompt) => earlier.includes(normalize(prompt)));
          out.push({
            label: "No question repeated from the earlier lesson",
            passed: repeated.length === 0,
            detail: repeated.length ? `repeated "${repeated[0].slice(0, 80)}"` : "none repeated",
          });
        }
        return out;
      }
      case "roadmap": {
        const items = prose.match(NUMBERED_ITEM)?.length ?? 0;
        return [
          {
            label: "Roadmap of 2–6 parts",
            passed: inRange(items, [2, 6]),
            detail: `${items} numbered items`,
          },
        ];
      }
      case "readLibrary": {
        const reads = reply.toolCalls.filter(({ name }) =>
          (LIBRARY_TOOLS as readonly string[]).includes(name),
        );
        return [
          {
            label: "Read the library",
            passed: reads.length > 0,
            detail: `${reads.length} library calls`,
          },
        ];
      }
      default:
        return runTextChecks(prose, [check]);
    }
  });
  return { facts, checks: [nonEmpty, ...results] };
}

export interface LearningAttemptResult {
  caseId: string;
  attempt: number;
  passed: boolean;
  latencyMs: number;
  reply?: LearningReply;
  trace?: AttemptTrace;
  facts?: LessonFacts;
  checks?: TextCheckResult[];
  failure?: { reason: "error" | "timeout"; name: string; message: string };
}

export interface LearningEvaluationSummary {
  plannedAttempts: number;
  completedAttempts: number;
  /** Gating cases only. */
  passed: number;
  gatingAttempts: number;
  /** Report-only cases, passed and attempted. */
  reportPassed: number;
  reportAttempts: number;
  rejectedWidgets: number;
  longestAnswerChoices: number;
  choices: number;
  failures: { error: number; timeout: number };
  cases: Array<{ caseId: string; passes: number; attempts: number; report: boolean }>;
}

export interface LearningEvaluationResult {
  formatVersion: 1;
  kind: "learning";
  evaluationId: string;
  status: "completed" | "canceled";
  startedAt: string;
  finishedAt: string;
  agent: AgentIdentity;
  /** SHA-256 of the cases file. */
  revisions: { cases: string };
  config: { concurrency: number; attemptsPerCase: number; attemptTimeoutMs: number };
  cases: LearningCase[];
  attempts: LearningAttemptResult[];
  summary: LearningEvaluationSummary;
}

/** Why a learning attempt did not pass, one line per cause; empty for a passed attempt. */
export function learningAttemptReasons(attempt: LearningAttemptResult): string[] {
  if (attempt.passed) return [];
  if (attempt.failure)
    return [
      `${attempt.failure.reason === "timeout" ? "Timed out" : "Agent error"}: ${attempt.failure.message}`,
    ];
  return (attempt.checks ?? [])
    .filter((check) => !check.passed)
    .map((check) => `${check.label} failed (${check.detail})`);
}

const buildSummary = (
  cases: LearningCase[],
  attempts: LearningAttemptResult[],
): LearningEvaluationSummary => {
  const reportOnly = new Set(cases.filter((item) => item.report).map(({ caseId }) => caseId));
  const gating = attempts.filter((attempt) => !reportOnly.has(attempt.caseId));
  const reported = attempts.filter((attempt) => reportOnly.has(attempt.caseId));
  const sum = (pick: (facts: LessonFacts) => number) =>
    attempts.reduce((total, { facts }) => total + (facts ? pick(facts) : 0), 0);
  return {
    plannedAttempts: cases.length * ATTEMPTS_PER_CASE,
    completedAttempts: attempts.length,
    passed: gating.filter((attempt) => attempt.passed).length,
    gatingAttempts: gating.length,
    reportPassed: reported.filter((attempt) => attempt.passed).length,
    reportAttempts: reported.length,
    rejectedWidgets: sum((facts) => facts.rejectedWidgets),
    longestAnswerChoices: sum((facts) => facts.longestAnswerChoices),
    choices: sum((facts) => facts.choices),
    failures: {
      error: attempts.filter((attempt) => attempt.failure?.reason === "error").length,
      timeout: attempts.filter((attempt) => attempt.failure?.reason === "timeout").length,
    },
    cases: cases.map(({ caseId, report }) => {
      const own = attempts.filter((attempt) => attempt.caseId === caseId);
      return {
        caseId,
        passes: own.filter((attempt) => attempt.passed).length,
        attempts: own.length,
        report: Boolean(report),
      };
    }),
  };
};

export interface RunLearningEvaluationOptions {
  cases: LearningCase[];
  revisions: { cases: string };
  agent: LearningAdapter;
  concurrency?: number;
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: {
    completed: number;
    total: number;
    attempt: LearningAttemptResult;
  }) => void;
  now?: () => Date;
  createId?: () => string;
}

class Canceled extends Error {}

/**
 * Runs every case three times with learning mode on. An attempt passes when every check of its
 * case passes; checks are code over the reply and its widget, no judge. Report-only cases are
 * scored the same way but kept out of the pass count.
 */
export async function runLearningEvaluation(
  options: RunLearningEvaluationOptions,
): Promise<LearningEvaluationResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError("Concurrency must be a positive integer.");
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const outer = options.signal ?? new AbortController().signal;

  const runAttempt = async (
    item: LearningCase,
    attempt: number,
  ): Promise<LearningAttemptResult> => {
    const signal = AbortSignal.any([outer, AbortSignal.timeout(attemptTimeoutMs)]);
    const started = performance.now();
    try {
      const reply = await untilAborted(
        options.agent.converse(
          { caseId: item.caseId, message: item.message, history: item.history ?? [] },
          signal,
        ),
        signal,
      );
      const scored = scoreLearningReply(item.checks, reply);
      return {
        caseId: item.caseId,
        attempt,
        passed: scored.checks.every((check) => check.passed),
        latencyMs: performance.now() - started,
        reply,
        ...scored,
      };
    } catch (error) {
      if (outer.aborted) throw new Canceled();
      return {
        caseId: item.caseId,
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
  };

  const tasks = options.cases.flatMap((item) =>
    Array.from({ length: ATTEMPTS_PER_CASE }, (_, index) => ({ item, attempt: index + 1 })),
  );
  const slots: Array<LearningAttemptResult | undefined> = Array.from({ length: tasks.length });
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
    kind: "learning",
    evaluationId: options.createId?.() ?? crypto.randomUUID(),
    status: outer.aborted ? "canceled" : "completed",
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    agent: options.agent.identity,
    revisions: options.revisions,
    config: { concurrency, attemptsPerCase: ATTEMPTS_PER_CASE, attemptTimeoutMs },
    cases: options.cases,
    attempts,
    summary: buildSummary(options.cases, attempts),
  };
}
