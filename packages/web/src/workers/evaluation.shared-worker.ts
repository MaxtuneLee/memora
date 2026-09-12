import { openDataset } from "@memora/datasets";
import { runEvaluation, type ModelAdapter } from "@memora/evaluation";
import { getLocalModelManifest } from "@memora/local-model-runtime";

import type {
  EvaluationWorkerRequest,
  EvaluationWorkerResponse,
} from "@/lib/playground/evaluationWorkerProtocol";

const operations = new Map<string, AbortController>();
const modelRequests = new Map<
  string,
  { resolve: (prediction: string) => void; reject: (error: Error) => void }
>();

const post = (port: MessagePort, message: EvaluationWorkerResponse, transfer?: Transferable[]) =>
  port.postMessage(message, transfer ?? []);

const requestModel = (
  port: MessagePort,
  message: Extract<EvaluationWorkerResponse, { type: "model-request" }>,
  signal?: AbortSignal,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const abort = () => {
      modelRequests.delete(message.id);
      post(port, { id: crypto.randomUUID(), type: "model-cancel", targetId: message.id });
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    modelRequests.set(message.id, {
      resolve: (prediction) => {
        signal?.removeEventListener("abort", abort);
        resolve(prediction);
      },
      reject: (error) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      },
    });
    const transfer =
      message.operation === "transcribe" && message.pcm.buffer instanceof ArrayBuffer
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
    await requestModel(
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
    requestModel(
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
  if (request.type === "model-result") {
    const pending = modelRequests.get(request.targetId);
    if (!pending) return;
    modelRequests.delete(request.targetId);
    if (request.error) pending.reject(new Error(request.error));
    else pending.resolve(request.prediction ?? "");
    return;
  }
  const controller = new AbortController();
  operations.set(request.id, controller);
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
