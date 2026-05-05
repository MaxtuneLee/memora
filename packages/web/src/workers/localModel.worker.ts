import { env } from "@huggingface/transformers";
import { normalizeLocalModelError } from "@memora/local-model-runtime";
import type {
  LocalModelEvent,
  LocalModelEventEnvelope,
  LocalModelWorkerMessage,
} from "@memora/local-model-runtime";

import { configureTransformersCache } from "./local-model/cache";
import { runLocalModelTask } from "./local-model/runtime";

configureTransformersCache(env);

const canceledRequests = new Set<string>();

const postEvent = (requestId: string, event: LocalModelEvent): void => {
  if (canceledRequests.has(requestId) && !(event.type === "status" && event.status === "aborted")) {
    return;
  }
  self.postMessage({ requestId, event } satisfies LocalModelEventEnvelope);
};

const runTask = async (
  message: Extract<LocalModelWorkerMessage, { type: "run" }>,
): Promise<void> => {
  postEvent(message.requestId, { type: "status", status: "assigned" });
  try {
    await runLocalModelTask(
      message.task,
      (event) => postEvent(message.requestId, event),
      () => canceledRequests.has(message.requestId),
    );
  } catch (error) {
    postEvent(message.requestId, { type: "error", error: normalizeLocalModelError(error) });
  } finally {
    postEvent(message.requestId, {
      type: "status",
      status: canceledRequests.has(message.requestId) ? "aborted" : "completed",
    });
  }
};

self.addEventListener("message", (event: MessageEvent<LocalModelWorkerMessage>) => {
  const message = event.data;
  if (message.type === "cancel") {
    canceledRequests.add(message.requestId);
    postEvent(message.requestId, { type: "status", status: "aborted" });
    return;
  }

  canceledRequests.delete(message.requestId);
  void runTask(message);
});
