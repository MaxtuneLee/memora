import { openDataset } from "@memora/datasets";
import {
  AgentAttemptError,
  runAgentEvaluation,
  runEvaluation,
  type AgentAnswer,
  type JudgeVerdict,
  type ModelAdapter,
} from "@memora/evaluation";
import { getLocalModelManifest } from "@memora/local-model-runtime";

import type {
  EvaluationWorkerRequest,
  EvaluationWorkerResponse,
} from "@/lib/playground/evaluationWorkerProtocol";

const operations = new Map<string, AbortController>();
const hostRequests = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

const post = (port: MessagePort, message: EvaluationWorkerResponse, transfer?: Transferable[]) =>
  port.postMessage(message, transfer ?? []);

/** Asks the Window to serve a model or adapter call, and cancels it there on abort. */
const requestHost = <T>(
  port: MessagePort,
  message: Extract<EvaluationWorkerResponse, { type: "model-request" | "adapter-request" }>,
  signal?: AbortSignal,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const aborted = () => new DOMException("The operation was aborted.", "AbortError");
    if (signal?.aborted) {
      reject(aborted());
      return;
    }
    const abort = () => {
      post(port, { id: crypto.randomUUID(), type: "model-cancel", targetId: message.id });
      // A canceled agent call still answers, with its Trace; the runner waits for it briefly.
      if (message.type === "adapter-request") return;
      hostRequests.delete(message.id);
      reject(aborted());
    };
    signal?.addEventListener("abort", abort, { once: true });
    hostRequests.set(message.id, {
      resolve: (value) => {
        signal?.removeEventListener("abort", abort);
        resolve(value as T);
      },
      reject: (error) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      },
    });
    const transfer =
      message.type === "model-request" &&
      message.operation === "transcribe" &&
      message.pcm.buffer instanceof ArrayBuffer
        ? [message.pcm.buffer]
        : undefined;
    post(port, message, transfer);
  });

const createLocalAsrAdapter = (
  port: MessagePort,
  modelId: string,
  language: string,
): ModelAdapter => ({
  identity: {
    modelId,
    modelRevision: { status: "unknown" },
    adapter: getLocalModelManifest(modelId)?.asr?.adapter ?? "unknown",
    runtime: getLocalModelManifest(modelId)?.runtime ?? "unknown",
    inference: { language, priority: "background" },
  },
  initialize: async (signal) => {
    await requestHost(
      port,
      {
        id: crypto.randomUUID(),
        type: "model-request",
        operation: "preload",
        modelId,
      },
      signal,
    );
  },
  predict: ({ pcm }, signal) =>
    requestHost<string>(
      port,
      {
        id: crypto.randomUUID(),
        type: "model-request",
        operation: "transcribe",
        modelId,
        language,
        pcm,
      },
      signal,
    ),
});

async function execute(port: MessagePort, request: EvaluationWorkerRequest): Promise<void> {
  if (request.type === "cancel") {
    operations.get(request.targetId)?.abort();
    return;
  }
  if (request.type === "model-result" || request.type === "adapter-result") {
    const pending = hostRequests.get(request.targetId);
    if (!pending) return;
    hostRequests.delete(request.targetId);
    if (request.error)
      pending.reject(
        request.type === "adapter-result" && request.trace
          ? new AgentAttemptError(request.error, request.trace)
          : new Error(request.error),
      );
    else
      pending.resolve(request.type === "model-result" ? (request.prediction ?? "") : request.value);
    return;
  }
  const controller = new AbortController();
  operations.set(request.id, controller);
  if (request.type === "run-agent") {
    try {
      const result = await runAgentEvaluation({
        questions: request.questions,
        corpus: request.corpus,
        concurrency: request.concurrency,
        ...(request.memory ? { memory: request.memory } : {}),
        signal: controller.signal,
        agent: {
          identity: request.agent,
          answer: (question, signal) =>
            requestHost<AgentAnswer>(
              port,
              {
                id: crypto.randomUUID(),
                type: "adapter-request",
                runId: request.id,
                adapter: "agent",
                question,
              },
              signal,
            ),
        },
        judge: {
          identity: request.judge,
          judge: (input, signal) =>
            requestHost<JudgeVerdict>(
              port,
              {
                id: crypto.randomUUID(),
                type: "adapter-request",
                runId: request.id,
                adapter: "judge",
                input,
              },
              signal,
            ),
        },
        onProgress: (progress) => post(port, { id: request.id, type: "agent-progress", progress }),
      });
      post(port, { id: request.id, type: "agent-result", result });
    } finally {
      operations.delete(request.id);
    }
    return;
  }
  const dataset = await openDataset(request.selection);
  try {
    const result = await runEvaluation({
      dataset,
      model: createLocalAsrAdapter(port, request.modelId, request.language),
      signal: controller.signal,
      onProgress: (progress) => post(port, { id: request.id, type: "progress", progress }),
    });
    post(port, { id: request.id, type: "result", result });
  } finally {
    operations.delete(request.id);
    dataset.close();
  }
}

interface SharedWorkerScope extends WorkerGlobalScope {
  onconnect: ((event: MessageEvent) => void) | null;
}

(self as unknown as SharedWorkerScope).onconnect = (event) => {
  const port = event.ports[0];
  port.onmessage = (message: MessageEvent<EvaluationWorkerRequest>) => {
    void execute(port, message.data).catch((error: unknown) =>
      post(port, {
        id: message.data.id,
        type: "error",
        message: error instanceof Error ? error.message : "Evaluation failed.",
      }),
    );
  };
  port.start();
};
