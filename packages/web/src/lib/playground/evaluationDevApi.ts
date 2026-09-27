import {
  agentEvaluationTotals,
  attemptFailureReasons,
  attemptStatus,
  type AgentEvaluationResult,
  type EvaluationQuestion,
} from "@memora/evaluation";

import { readTrace } from "@/lib/agent-runtime/client";

import type { EvaluationImport, EvaluationImportFile } from "./evaluationImport";

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
  importData(
    files: EvaluationImportFile[],
    questions: EvaluationImportFile,
  ): Promise<EvaluationImport>;
  runEvaluation(
    data: EvaluationImport,
    questions: EvaluationQuestion[],
    concurrency: number,
  ): Promise<void>;
}

export interface MemoraEvalApi {
  /** Imports `<dataset>/<transcripts>/` and `<dataset>/<questions>` from the data folder. */
  import(options?: {
    dataset?: string;
    transcripts?: string;
    questions?: string;
  }): Promise<{ questions: string[]; lectures: string[] }>;
  /** Starts a run on the imported data and returns at once; poll `status()`. */
  run(options?: { questionIds?: string[]; concurrency?: number }): {
    questions: number;
    attempts: number;
  };
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
export async function evaluationExportJson(result: AgentEvaluationResult): Promise<string> {
  const traces: Record<string, unknown> = {};
  for (const attempt of result.attempts) {
    const trace = attempt.answer ?? attempt.trace;
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
    summary: {
      passed: result.summary.passed,
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

/** Installs `window.__memoraEval`; the returned function removes it. */
export function installEvaluationDevApi(handlers: () => EvaluationDevApiHandlers): () => void {
  let imported: EvaluationImport | undefined;
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
    run({ questionIds, concurrency = 3 } = {}) {
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
      void page.runEvaluation(data, questions, concurrency).catch(console.error);
      return { questions: questions.length, attempts: questions.length * 3 };
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
      const path = `results/agent-evaluation-${result.evaluationId}.json`;
      const response = await fetch(`${DATA_URL}/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: await evaluationExportJson(result),
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      return path;
    },
  };
  window.__memoraEval = api;
  return () => {
    if (window.__memoraEval === api) delete window.__memoraEval;
  };
}
