import { EvaluationError } from "./errors";
import { parseEvaluationResult } from "./schema";
import { opfsResultStorage, type ResultStorage } from "./storage";
import type { DatasetSelection } from "@memora/datasets";
import { agentTokenTotals, type AgentTokenTotals } from "./agentReport";
import type { AgentEvaluationResult } from "./agentTypes";
import type { EvaluationResult, EvaluationSummary, ModelIdentity } from "./types";

export type { ResultStorage } from "./storage";

const STORAGE_ROOT = "/memora/evaluations";
const resultPath = (runId: string) => `${STORAGE_ROOT}/${encodeURIComponent(runId)}.json`;

export interface SavedResultSummary {
  runId: string;
  dataset: DatasetSelection;
  model: ModelIdentity;
  status: EvaluationResult["status"];
  startedAt: string;
  finishedAt: string;
  summary: EvaluationSummary;
}

interface ResultStorageOptions {
  storage?: ResultStorage;
}

const resolveStorage = (options: ResultStorageOptions) => options.storage ?? opfsResultStorage;

export async function saveEvaluationResult(
  result: EvaluationResult,
  options: ResultStorageOptions = {},
): Promise<void> {
  const storage = resolveStorage(options);
  try {
    await storage.write(resultPath(result.runId), JSON.stringify(result));
  } catch (error) {
    throw new EvaluationError("save-failed", "The evaluation result could not be saved.", {
      cause: error,
    });
  }
}

export async function listEvaluationResults(
  options: ResultStorageOptions = {},
): Promise<SavedResultSummary[]> {
  const storage = resolveStorage(options);
  const paths = await storage.list(STORAGE_ROOT);
  const summaries: SavedResultSummary[] = [];
  for (const path of paths) {
    if (!path.endsWith(".json")) continue;
    try {
      const result = parseEvaluationResult(JSON.parse(await storage.readText(path)));
      summaries.push({
        runId: result.runId,
        dataset: result.dataset,
        model: result.model,
        status: result.status,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        summary: result.summary,
      });
    } catch {
      continue;
    }
  }
  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readEvaluationResult(
  runId: string,
  options: ResultStorageOptions = {},
): Promise<EvaluationResult> {
  const storage = resolveStorage(options);
  const path = resultPath(runId);
  if (!(await storage.exists(path)))
    throw new EvaluationError("not-found", `No saved result for run ${runId}.`);
  let raw: string;
  try {
    raw = await storage.readText(path);
  } catch (error) {
    throw new EvaluationError("not-found", `No saved result for run ${runId}.`, { cause: error });
  }
  try {
    return parseEvaluationResult(JSON.parse(raw));
  } catch (error) {
    throw new EvaluationError("invalid-result", `The saved result for run ${runId} is corrupted.`, {
      cause: error,
    });
  }
}

const AGENT_STORAGE_ROOT = "/memora/agent-evaluations";
const agentResultPath = (evaluationId: string) =>
  `${AGENT_STORAGE_ROOT}/${encodeURIComponent(evaluationId)}.json`;

export async function saveAgentEvaluationResult(
  result: AgentEvaluationResult,
  options: ResultStorageOptions = {},
): Promise<void> {
  try {
    await resolveStorage(options).write(
      agentResultPath(result.evaluationId),
      JSON.stringify(result),
    );
  } catch (error) {
    throw new EvaluationError("save-failed", "The agent evaluation result could not be saved.", {
      cause: error,
    });
  }
}

// ponytail: checks kind and format version only; add a valibot schema when results are migrated.
const parseAgentResult = (text: string): AgentEvaluationResult | null => {
  const parsed = JSON.parse(text) as Partial<AgentEvaluationResult> | null;
  return parsed?.kind === "agent" && parsed.formatVersion === 1
    ? (parsed as AgentEvaluationResult)
    : null;
};

export async function readAgentEvaluationResult(
  evaluationId: string,
  options: ResultStorageOptions = {},
): Promise<AgentEvaluationResult> {
  const storage = resolveStorage(options);
  const path = agentResultPath(evaluationId);
  if (!(await storage.exists(path)))
    throw new EvaluationError("not-found", `No saved agent evaluation ${evaluationId}.`);
  const corrupted = `The agent evaluation ${evaluationId} is corrupted.`;
  let parsed: AgentEvaluationResult | null;
  try {
    parsed = parseAgentResult(await storage.readText(path));
  } catch (error) {
    throw new EvaluationError("invalid-result", corrupted, { cause: error });
  }
  if (!parsed) throw new EvaluationError("invalid-result", corrupted);
  return parsed;
}

export interface SavedAgentEvaluationSummary {
  evaluationId: string;
  status: AgentEvaluationResult["status"];
  startedAt: string;
  finishedAt: string;
  model: string;
  passed: number;
  completed: number;
  tokens: AgentTokenTotals;
}

/** Saved agent evaluations, newest first; corrupted files are skipped. */
export async function listAgentEvaluationResults(
  options: ResultStorageOptions = {},
): Promise<SavedAgentEvaluationSummary[]> {
  const storage = resolveStorage(options);
  const summaries: SavedAgentEvaluationSummary[] = [];
  for (const path of await storage.list(AGENT_STORAGE_ROOT)) {
    if (!path.endsWith(".json")) continue;
    let result: AgentEvaluationResult | null;
    try {
      result = parseAgentResult(await storage.readText(path));
    } catch {
      continue;
    }
    if (!result) continue;
    summaries.push({
      evaluationId: result.evaluationId,
      status: result.status,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      model: result.agent.model,
      passed: result.summary.passed,
      completed: result.summary.completedAttempts,
      tokens: agentTokenTotals(result.attempts),
    });
  }
  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
