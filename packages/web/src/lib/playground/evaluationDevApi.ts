import {
  agentEvaluationTotals,
  agentTokenTotals,
  attemptFailureReasons,
  attemptStatus,
  memoryAttemptReasons,
  parseMemoryCases,
  parseMemoryProfiles,
  type AgentEvaluationResult,
  type EvaluationQuestion,
  type MemoryCase,
  type MemoryEvaluationResult,
  type MemoryProfile,
  type PastSession,
} from "@memora/evaluation";

import { readTrace } from "@/lib/agent-runtime/client";

import { sha256Hex, type EvaluationImport, type EvaluationImportFile } from "./evaluationImport";

/** The dev server's view of the local evaluation data folder; see `vite.config.ts`. */
const DATA_URL = "/api/playground/eval-data";

/** What the agent evaluation page lends the development API on each render. */
export interface EvaluationDevApiHandlers {
  data: EvaluationImport | undefined;
  run: {
    status: "idle" | "running" | "failed" | "done";
    completed?: number;
    total?: number;
    message?: string;
    result?: AgentEvaluationResult;
  };
  shown: AgentEvaluationResult | undefined;
  importData: (
    files: EvaluationImportFile[],
    questions: EvaluationImportFile,
  ) => Promise<EvaluationImport>;
  runEvaluation: (
    data: EvaluationImport,
    questions: EvaluationQuestion[],
    concurrency: number,
    memory?: MemoryProfile,
  ) => Promise<AgentEvaluationResult | undefined>;
  runMemory: (
    file: { sessions: PastSession[]; cases: MemoryCase[]; revision: string },
    concurrency: number,
    signal: AbortSignal,
  ) => Promise<MemoryEvaluationResult>;
}

export interface MemoraEvalApi {
  /** Imports `<dataset>/<transcripts>/` and `<dataset>/<questions>` from the data folder. */
  import(options?: {
    dataset?: string;
    transcripts?: string;
    questions?: string;
  }): Promise<{ questions: string[]; lectures: string[] }>;
  /**
   * Starts a run on the imported data and returns at once. When it finishes, the result with its
   * Traces and a compact report are written to `results/` in the data folder, so a caller can wait
   * for the report file instead of polling `status()`.
   */
  run(options?: {
    questionIds?: string[];
    concurrency?: number;
    /** Answer under this profile's notices and check its rules; see `memory/profiles-v1.json`. */
    profile?: string;
    /** The profiles file in the data folder; default `memory/profiles-v1.json`. */
    profiles?: string;
  }): Promise<{ questions: number; attempts: number }>;
  /**
   * Starts the memory evaluation (saving preferences, recalling earlier chats) and returns at once;
   * like `run`, the result and a compact report are written to `results/` when it finishes.
   */
  runMemory(options?: { caseIds?: string[]; concurrency?: number; cases?: string }): Promise<{
    cases: number;
    attempts: number;
  }>;
  /** Progress of the memory evaluation; a compact report when done. */
  memoryStatus(): unknown;
  /** Progress while running; a compact report when done. */
  status(): unknown;
  /** Writes the last result with its Traces to `results/` in the data folder; returns the path. */
  save(): Promise<string>;
}

declare global {
  interface Window {
    __memoraEval?: MemoraEvalApi;
  }
}

/** The result with each attempt's Trace inlined, keyed by `<sessionId>/<runId>`. */
export async function evaluationExportJson(
  result: AgentEvaluationResult | MemoryEvaluationResult,
): Promise<string> {
  const traces: Record<string, unknown> = {};
  for (const attempt of result.attempts) {
    const trace =
      ("answer" in attempt ? attempt.answer : "reply" in attempt ? attempt.reply : undefined) ??
      attempt.trace;
    if (!trace?.runId) continue;
    // Traces exist only in development builds; a missing one is left out.
    traces[`${trace.sessionId}/${trace.runId}`] = await readTrace(
      trace.sessionId,
      trace.runId,
    ).catch(() => null);
  }
  return JSON.stringify({ ...result, traces }, null, 2);
}

const fetchFile = async (path: string): Promise<EvaluationImportFile> => {
  const response = await fetch(`${DATA_URL}/${path}`);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
};

/** Counts, per-question passes, and why each attempt that did not pass failed. */
const report = (result: AgentEvaluationResult) => {
  const totals = agentEvaluationTotals(result);
  return {
    evaluationId: result.evaluationId,
    outcome: result.status,
    ...(result.memory ? { profile: result.memory.profileId } : {}),
    summary: {
      passed: result.summary.passed,
      ...(result.summary.preferencePassed !== undefined
        ? { preferencePassed: result.summary.preferencePassed }
        : {}),
      uncertain: result.summary.uncertain ?? 0,
      completed: result.summary.completedAttempts,
      retrievalPassed: result.summary.retrievalPassed,
      failures: result.summary.failures,
      unsupportedClaims: result.attempts.filter(
        (attempt) => attempt.coverage?.verdict.unsupportedClaims.present,
      ).length,
      tokens: totals.agentTokens,
      durationMs: totals.durationMs,
    },
    questions: Object.fromEntries(
      result.summary.questions.map(({ questionId, passes, attempts }) => [
        questionId,
        `${passes}/${attempts}`,
      ]),
    ),
    notPassed: result.attempts
      .filter((attempt) => !attempt.passed)
      .map((attempt) => ({
        questionId: attempt.questionId,
        attempt: attempt.attempt,
        status: attemptStatus(attempt),
        reasons: attemptFailureReasons(attempt),
      })),
  };
};

const putJson = async (path: string, body: string): Promise<void> => {
  const response = await fetch(`${DATA_URL}/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
};

/** Save and recall outcomes, per-case passes, and why each attempt that did not pass failed. */
const memoryReport = (result: MemoryEvaluationResult) => {
  const { summary } = result;
  const cases = new Map(result.cases.map((item) => [item.caseId, item]));
  return {
    evaluationId: result.evaluationId,
    kind: "memory",
    outcome: result.status,
    summary: {
      passed: summary.passed,
      completed: summary.completedAttempts,
      save: summary.save,
      recall: summary.recall,
      failures: summary.failures,
      tokens: agentTokenTotals(
        result.attempts.map((attempt) => ({ trace: attempt.reply ?? attempt.trace })),
      ),
      durationMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt),
    },
    cases: Object.fromEntries(
      summary.cases.map(({ caseId, passes, attempts }) => [caseId, `${passes}/${attempts}`]),
    ),
    notPassed: result.attempts
      .filter((attempt) => !attempt.passed)
      .map((attempt) => {
        const item = cases.get(attempt.caseId);
        return {
          caseId: attempt.caseId,
          attempt: attempt.attempt,
          reasons: item ? memoryAttemptReasons(item, attempt) : [],
          ...(attempt.reply?.notices.length ? { notices: attempt.reply.notices } : {}),
        };
      }),
  };
};

/** Writes the export, then its report; the report appearing means both are complete. */
const saveResult = async (
  result: AgentEvaluationResult | MemoryEvaluationResult,
): Promise<string> => {
  const name = `${result.kind === "memory" ? "memory" : "agent"}-evaluation-${result.evaluationId}`;
  await putJson(`results/${name}.json`, await evaluationExportJson(result));
  await putJson(
    `results/${name}.report.json`,
    JSON.stringify(result.kind === "memory" ? memoryReport(result) : report(result), null, 2),
  );
  return `results/${name}.json`;
};

const fetchJson = async (path: string): Promise<{ data: unknown; revision: string }> => {
  const { bytes } = await fetchFile(path);
  return { data: JSON.parse(new TextDecoder().decode(bytes)), revision: await sha256Hex(bytes) };
};

type MemoryRunState =
  | { status: "idle" }
  | { status: "running"; controller: AbortController }
  | { status: "failed"; message: string }
  | { status: "done"; result: MemoryEvaluationResult };

/** Installs `window.__memoraEval`; the returned function removes it. */
export function installEvaluationDevApi(handlers: () => EvaluationDevApiHandlers): () => void {
  let imported: EvaluationImport | undefined;
  let memoryRun: MemoryRunState = { status: "idle" };
  const api: MemoraEvalApi = {
    async import({
      dataset = "ocw-6-7960",
      transcripts = "v2",
      questions = "questions-draft-v1.json",
    } = {}) {
      const folder = `${dataset}/${transcripts}`;
      const manifest = await fetchFile(`${folder}/manifest.json`);
      const { lectures } = JSON.parse(new TextDecoder().decode(manifest.bytes)) as {
        lectures: Array<{ lectureId: string }>;
      };
      const files = await Promise.all(
        lectures.flatMap(({ lectureId }) => [
          fetchFile(`${folder}/${lectureId}.transcript.json`),
          fetchFile(`${folder}/${lectureId}.cues.json`),
        ]),
      );
      imported = await handlers().importData(
        [manifest, ...files],
        await fetchFile(`${dataset}/${questions}`),
      );
      return {
        questions: imported.questions.map(({ questionId }) => questionId),
        lectures: imported.lectures.map(({ lectureId }) => lectureId),
      };
    },
    async run({
      questionIds,
      concurrency = 3,
      profile,
      profiles = "memory/profiles-v1.json",
    } = {}) {
      const memory = profile
        ? parseMemoryProfiles((await fetchJson(profiles)).data).find(
            ({ profileId }) => profileId === profile,
          )
        : undefined;
      if (profile && !memory) throw new Error(`Not in ${profiles}: ${profile}`);
      const page = handlers();
      const data = page.data ?? imported;
      const { run } = page;
      if (!data) throw new Error("Import the evaluation data first.");
      if (run.status === "running") throw new Error("An evaluation is already running.");
      const unknown = (questionIds ?? []).filter(
        (id) => !data.questions.some(({ questionId }) => questionId === id),
      );
      if (unknown.length) throw new Error(`Not in the questions file: ${unknown.join(", ")}`);
      const questions = questionIds
        ? data.questions.filter(({ questionId }) => questionIds.includes(questionId))
        : data.questions;
      // Errors after the start are reported through status().
      void page
        .runEvaluation(data, questions, concurrency, memory)
        .then((result) => result && saveResult(result))
        .catch(console.error);
      return { questions: questions.length, attempts: questions.length * 3 };
    },
    async runMemory({ caseIds, concurrency = 3, cases = "memory/cases-v1.json" } = {}) {
      if (memoryRun.status === "running")
        throw new Error("A memory evaluation is already running.");
      const { data, revision } = await fetchJson(cases);
      const file = parseMemoryCases(data);
      const unknown = (caseIds ?? []).filter(
        (id) => !file.cases.some(({ caseId }) => caseId === id),
      );
      if (unknown.length) throw new Error(`Not in ${cases}: ${unknown.join(", ")}`);
      const selected = caseIds
        ? file.cases.filter(({ caseId }) => caseIds.includes(caseId))
        : file.cases;
      const controller = new AbortController();
      memoryRun = { status: "running", controller };
      // Errors after the start are reported through memoryStatus().
      void handlers()
        .runMemory(
          { sessions: file.sessions, cases: selected, revision },
          concurrency,
          controller.signal,
        )
        .then(async (result) => {
          memoryRun = { status: "done", result };
          await saveResult(result);
        })
        .catch((error: unknown) => {
          memoryRun = {
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          };
          console.error(error);
        });
      return { cases: selected.length, attempts: selected.length * 3 };
    },
    memoryStatus() {
      if (memoryRun.status === "done") return { status: "done", ...memoryReport(memoryRun.result) };
      if (memoryRun.status === "failed") return memoryRun;
      return { status: memoryRun.status };
    },
    status() {
      const { run } = handlers();
      if (run.status === "done" && run.result) return { status: "done", ...report(run.result) };
      return run.status === "running"
        ? { status: run.status, completed: run.completed, total: run.total }
        : { status: run.status, ...(run.message ? { message: run.message } : {}) };
    },
    async save() {
      const { run, shown } = handlers();
      const result = run.result ?? shown;
      if (!result) throw new Error("No evaluation result to save.");
      return saveResult(result);
    },
  };
  window.__memoraEval = api;
  return () => {
    if (window.__memoraEval === api) delete window.__memoraEval;
  };
}
