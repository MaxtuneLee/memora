import { EvaluationError } from "./errors";
import { parseEvaluationResult } from "./schema";
import { opfsResultStorage, type ResultStorage } from "./storage";
import type { DatasetSelection } from "@memora/datasets";
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

// ponytail: checks kind and format version only; add a valibot schema when results are listed or migrated.
export async function readAgentEvaluationResult(
  evaluationId: string,
  options: ResultStorageOptions = {},
): Promise<AgentEvaluationResult> {
  const storage = resolveStorage(options);
  const path = agentResultPath(evaluationId);
  if (!(await storage.exists(path)))
    throw new EvaluationError("not-found", `No saved agent evaluation ${evaluationId}.`);
  const corrupted = `The agent evaluation ${evaluationId} is corrupted.`;
  let parsed: Partial<AgentEvaluationResult> | null;
  try {
    parsed = JSON.parse(await storage.readText(path));
  } catch (error) {
    throw new EvaluationError("invalid-result", corrupted, { cause: error });
  }
  if (parsed?.kind !== "agent" || parsed.formatVersion !== 1)
    throw new EvaluationError("invalid-result", corrupted);
  return parsed as AgentEvaluationResult;
}
