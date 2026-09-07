import type {
  DatasetExample,
  DatasetInspection,
  DatasetSelection,
  EncodedMedia,
  FeatureSchema,
  InstallProgress,
  InstalledDataset,
  MediaReference,
} from "@memora/datasets";

import type {
  DatasetWorkerRequest,
  DatasetWorkerResponse,
  DatasetWorkerResult,
} from "./datasetWorkerProtocol";

interface PendingRequest {
  resolve: (value: DatasetWorkerResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: InstallProgress) => void;
}
type DatasetWorkerRequestWithoutId = DatasetWorkerRequest extends infer Request
  ? Request extends { id: string }
    ? Omit<Request, "id">
    : never
  : never;
let port: MessagePort | undefined;
const pending = new Map<string, PendingRequest>();

function getPort(): MessagePort {
  if (port) return port;
  const worker = new SharedWorker(
    new URL("../../workers/dataset.shared-worker.ts", import.meta.url),
    { type: "module", name: "memora-datasets" },
  );
  port = worker.port;
  port.onmessage = (event: MessageEvent<DatasetWorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    if (event.data.type === "progress") {
      request.onProgress?.(event.data.progress);
      return;
    }
    pending.delete(event.data.id);
    if (event.data.type === "error")
      request.reject(Object.assign(new Error(event.data.message), { code: event.data.code }));
    else request.resolve(event.data.result);
  };
  port.start();
  return port;
}

function request<T extends DatasetWorkerResult>(
  message: DatasetWorkerRequestWithoutId,
  options?: { signal?: AbortSignal; onProgress?: (progress: InstallProgress) => void },
): Promise<T> {
  const id = crypto.randomUUID();
  const workerPort = getPort();
  return new Promise((resolve, reject) => {
    const abort = () =>
      workerPort.postMessage({
        id: crypto.randomUUID(),
        type: "cancel",
        targetId: id,
      } satisfies DatasetWorkerRequest);
    options?.signal?.addEventListener("abort", abort, { once: true });
    pending.set(id, {
      resolve: (value) => {
        options?.signal?.removeEventListener("abort", abort);
        resolve(value as T);
      },
      reject,
      onProgress: options?.onProgress,
    });
    workerPort.postMessage({ ...message, id });
  });
}

export const datasetClient = {
  inspect: (datasetId: string, revision?: string, signal?: AbortSignal) =>
    request<DatasetInspection>({ type: "inspect", datasetId, revision }, { signal }),
  install: (
    inspection: DatasetInspection,
    configuration: string,
    splits: string[],
    options?: { signal?: AbortSignal; onProgress?: (progress: InstallProgress) => void },
  ) => request<InstalledDataset[]>({ type: "install", inspection, configuration, splits }, options),
  list: () => request<InstalledDataset[]>({ type: "list" }),
  open: (selection: DatasetSelection) =>
    request<{ handleId: string; length?: number; features: FeatureSchema }>({
      type: "open",
      selection,
    }),
  next: (handleId: string, count = 8) =>
    request<DatasetExample[]>({ type: "next", handleId, count }),
  media: (handleId: string, reference: MediaReference) =>
    request<EncodedMedia>({ type: "media", handleId, reference }),
  close: (handleId: string) => request<null>({ type: "close", handleId }),
  delete: (selection: DatasetSelection) => request<null>({ type: "delete", selection }),
};
