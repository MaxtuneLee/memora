import type { DatasetSelection } from "@memora/datasets";
import {
  AgentAttemptError,
  type AgentAdapter,
  type AgentEvaluationProgress,
  type AgentEvaluationResult,
  type EvaluationProgress,
  type EvaluationResult,
  type JudgeAdapter,
  type RunAgentEvaluationOptions,
} from "@memora/evaluation";

import { localModelClient } from "../local-model/client";
import { datasetClient } from "./datasetClient";
import type { EvaluationWorkerRequest, EvaluationWorkerResponse } from "./evaluationWorkerProtocol";

interface PendingRun {
  resolve: (result: EvaluationResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: EvaluationProgress) => void;
}

interface PendingAgentRun {
  resolve: (result: AgentEvaluationResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: AgentEvaluationProgress) => void;
  agent: AgentAdapter;
  judge: JudgeAdapter;
}

let port: MessagePort | undefined;
const runs = new Map<string, PendingRun>();
const agentRuns = new Map<string, PendingAgentRun>();
const modelOperations = new Map<string, AbortController>();

const reply = (message: EvaluationWorkerRequest) => getPort().postMessage(message);

async function handleModelRequest(
  message: Extract<EvaluationWorkerResponse, { type: "model-request" }>,
) {
  const controller = new AbortController();
  modelOperations.set(message.id, controller);
  try {
    if (message.operation === "preload") {
      let error: string | undefined;
      for await (const event of localModelClient.preloadModel(message.modelId, {
        priority: "background",
        signal: controller.signal,
      })) {
        if (event.type === "error") error = event.error.message;
      }
      reply({
        id: crypto.randomUUID(),
        type: "model-result",
        targetId: message.id,
        ...(error ? { error } : { prediction: "" }),
      });
      return;
    }
    let prediction = "";
    let error: string | undefined;
    for await (const event of localModelClient.transcribeAudio(
      { modelId: message.modelId, audio: message.pcm, language: message.language },
      { priority: "background", signal: controller.signal, transferAudio: true },
    )) {
      if (event.type === "transcript-complete") prediction = event.text;
      if (event.type === "error") error = event.error.message;
    }
    reply({
      id: crypto.randomUUID(),
      type: "model-result",
      targetId: message.id,
      ...(error ? { error } : { prediction }),
    });
  } catch (error) {
    reply({
      id: crypto.randomUUID(),
      type: "model-result",
      targetId: message.id,
      error: error instanceof Error ? error.message : "Model request failed.",
    });
  } finally {
    modelOperations.delete(message.id);
  }
}

async function handleAdapterRequest(
  message: Extract<EvaluationWorkerResponse, { type: "adapter-request" }>,
) {
  const controller = new AbortController();
  modelOperations.set(message.id, controller);
  try {
    const run = agentRuns.get(message.runId);
    if (!run) throw new Error("The evaluation is no longer running.");
    const value =
      message.adapter === "agent"
        ? await run.agent.answer(message.question, controller.signal)
        : await run.judge.judge(message.input, controller.signal);
    reply({ id: crypto.randomUUID(), type: "adapter-result", targetId: message.id, value });
  } catch (error) {
    reply({
      id: crypto.randomUUID(),
      type: "adapter-result",
      targetId: message.id,
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof AgentAttemptError ? { trace: error.trace } : {}),
    });
  } finally {
    modelOperations.delete(message.id);
  }
}

function getPort(): MessagePort {
  if (port) return port;
  const worker = new SharedWorker(
    new URL("../../workers/evaluation.shared-worker.ts", import.meta.url),
    {
      type: "module",
      name: "memora-evaluation",
    },
  );
  port = worker.port;
  port.onmessage = (event: MessageEvent<EvaluationWorkerResponse>) => {
    const message = event.data;
    if (message.type === "model-request") {
      void handleModelRequest(message);
      return;
    }
    if (message.type === "adapter-request") {
      void handleAdapterRequest(message);
      return;
    }
    if (message.type === "model-cancel") {
      modelOperations.get(message.targetId)?.abort();
      return;
    }
    const agentRun = agentRuns.get(message.id);
    if (agentRun) {
      if (message.type === "agent-progress") agentRun.onProgress?.(message.progress);
      else if (message.type === "agent-result" || message.type === "error") {
        agentRuns.delete(message.id);
        if (message.type === "error") agentRun.reject(new Error(message.message));
        else agentRun.resolve(message.result);
      }
      return;
    }
    const run = runs.get(message.id);
    if (!run) return;
    if (message.type === "progress") run.onProgress?.(message.progress);
    else if (message.type === "result" || message.type === "error") {
      runs.delete(message.id);
      if (message.type === "error") run.reject(new Error(message.message));
      else run.resolve(message.result);
    }
  };
  port.start();
  return port;
}

export const evaluationClient = {
  run(
    selection: DatasetSelection,
    modelId: string,
    language: string,
    options?: { signal?: AbortSignal; onProgress?: (progress: EvaluationProgress) => void },
  ): Promise<EvaluationResult> {
    const id = crypto.randomUUID();
    const workerPort = getPort();
    // Reserve the split with the dataset SharedWorker (the single owner visible to every
    // tab) before the evaluation worker opens it, so a delete request racing this run is
    // guaranteed to see the reservation once this await resolves.
    return datasetClient.reserve(selection).then((): Promise<EvaluationResult> => {
      const release = () => void datasetClient.release(selection);
      if (options?.signal?.aborted) {
        release();
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      }
      return new Promise((resolve, reject) => {
        const abort = () =>
          workerPort.postMessage({
            id: crypto.randomUUID(),
            type: "cancel",
            targetId: id,
          } satisfies EvaluationWorkerRequest);
        options?.signal?.addEventListener("abort", abort, { once: true });
        runs.set(id, {
          resolve: (result) => {
            options?.signal?.removeEventListener("abort", abort);
            release();
            resolve(result);
          },
          reject: (error) => {
            options?.signal?.removeEventListener("abort", abort);
            release();
            reject(error);
          },
          onProgress: options?.onProgress,
        });
        workerPort.postMessage({
          id,
          type: "run",
          selection,
          modelId,
          language,
        } satisfies EvaluationWorkerRequest);
      });
    });
  },
  /** Runs the agent evaluation in the worker; the adapters are served from this Window. */
  runAgent(
    options: Pick<
      RunAgentEvaluationOptions,
      "questions" | "corpus" | "agent" | "judge" | "concurrency" | "memory"
    >,
    control?: { signal?: AbortSignal; onProgress?: (progress: AgentEvaluationProgress) => void },
  ): Promise<AgentEvaluationResult> {
    const id = crypto.randomUUID();
    const workerPort = getPort();
    return new Promise((resolve, reject) => {
      const abort = () =>
        workerPort.postMessage({
          id: crypto.randomUUID(),
          type: "cancel",
          targetId: id,
        } satisfies EvaluationWorkerRequest);
      control?.signal?.addEventListener("abort", abort, { once: true });
      const settle = () => control?.signal?.removeEventListener("abort", abort);
      agentRuns.set(id, {
        resolve: (result) => {
          settle();
          resolve(result);
        },
        reject: (error) => {
          settle();
          reject(error);
        },
        onProgress: control?.onProgress,
        agent: options.agent,
        judge: options.judge,
      });
      workerPort.postMessage({
        id,
        type: "run-agent",
        questions: options.questions,
        corpus: options.corpus,
        agent: options.agent.identity,
        judge: options.judge.identity,
        concurrency: options.concurrency,
        ...(options.memory ? { memory: options.memory } : {}),
      } satisfies EvaluationWorkerRequest);
    });
  },
};
