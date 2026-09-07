import {
  deleteInstalledDataset,
  createHuggingFaceSource,
  inspectDataset,
  installDataset,
  listInstalledDatasets,
  openDataset,
  type Dataset,
  type DatasetExample,
} from "@memora/datasets";

import type {
  DatasetWorkerRequest,
  DatasetWorkerResponse,
  DatasetWorkerResult,
} from "@/lib/playground/datasetWorkerProtocol";

const handles = new Map<string, { dataset: Dataset; iterator: AsyncIterator<DatasetExample> }>();
const operations = new Map<string, AbortController>();
let handleSequence = 0;

function post(port: MessagePort, response: DatasetWorkerResponse, transfer?: Transferable[]) {
  port.postMessage(response, transfer ?? []);
}

async function execute(
  port: MessagePort,
  request: DatasetWorkerRequest,
): Promise<DatasetWorkerResult> {
  if (request.type === "cancel") {
    operations.get(request.targetId)?.abort();
    return null;
  }
  if (request.type === "inspect") {
    const controller = new AbortController();
    operations.set(request.id, controller);
    try {
      return await inspectDataset(request.datasetId, {
        revision: request.revision,
        signal: controller.signal,
        source: createHuggingFaceSource({ hubUrl: request.hubUrl }),
      });
    } finally {
      operations.delete(request.id);
    }
  }
  if (request.type === "install") {
    const controller = new AbortController();
    operations.set(request.id, controller);
    try {
      return await installDataset(request.inspection, {
        configuration: request.configuration,
        splits: request.splits,
        signal: controller.signal,
        source: createHuggingFaceSource({ hubUrl: request.hubUrl }),
        onProgress: (progress) => post(port, { id: request.id, type: "progress", progress }),
      });
    } finally {
      operations.delete(request.id);
    }
  }
  if (request.type === "list") return listInstalledDatasets();
  if (request.type === "open") {
    const dataset = await openDataset(request.selection);
    const handleId = `dataset-${++handleSequence}`;
    handles.set(handleId, { dataset, iterator: dataset[Symbol.asyncIterator]() });
    return { handleId, length: dataset.length, features: dataset.features };
  }
  if (request.type === "next") {
    const handle = handles.get(request.handleId);
    if (!handle) throw new Error("Dataset handle is closed.");
    const examples: DatasetExample[] = [];
    while (examples.length < request.count) {
      const result = await handle.iterator.next();
      if (result.done) break;
      examples.push(result.value);
    }
    return examples;
  }
  if (request.type === "media") {
    const handle = handles.get(request.handleId);
    if (!handle) throw new Error("Dataset handle is closed.");
    return handle.dataset.readMedia(request.reference);
  }
  if (request.type === "close") {
    handles.get(request.handleId)?.dataset.close();
    handles.delete(request.handleId);
    return null;
  }
  await deleteInstalledDataset(request.selection);
  return null;
}

interface SharedWorkerScope extends WorkerGlobalScope {
  onconnect: ((event: MessageEvent) => void) | null;
}
const scope = self as unknown as SharedWorkerScope;
scope.onconnect = (event) => {
  const port = event.ports[0];
  port.onmessage = (message: MessageEvent<DatasetWorkerRequest>) => {
    void execute(port, message.data).then(
      (result) => {
        const transfer =
          result &&
          typeof result === "object" &&
          "bytes" in result &&
          result.bytes instanceof Uint8Array
            ? [result.bytes.buffer]
            : undefined;
        post(port, { id: message.data.id, type: "result", result }, transfer);
      },
      (error: unknown) =>
        post(port, {
          id: message.data.id,
          type: "error",
          code:
            error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
          message: error instanceof Error ? error.message : "Dataset operation failed.",
        }),
    );
  };
  port.start();
};
