import type { DatasetSelection } from "@memora/datasets";
import type { EvaluationProgress, EvaluationResult } from "@memora/evaluation";

import { localModelClient } from "../local-model/client";
import { activeEvaluationRuns } from "./activeEvaluationRuns";
import type { EvaluationWorkerRequest, EvaluationWorkerResponse } from "./evaluationWorkerProtocol";

interface PendingRun {
  resolve: (result: EvaluationResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: EvaluationProgress) => void;
}

let port: MessagePort | undefined;
const runs = new Map<string, PendingRun>();
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
    if (message.type === "model-cancel") {
      modelOperations.get(message.targetId)?.abort();
      return;
    }
    const run = runs.get(message.id);
    if (!run) return;
    if (message.type === "progress") run.onProgress?.(message.progress);
    else {
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
    const release = activeEvaluationRuns.begin(selection);
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
  },
};
