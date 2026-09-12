import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DatasetWorkerRequest } from "@/lib/playground/datasetWorkerProtocol";

const { deleteInstalledDataset } = vi.hoisted(() => ({
  deleteInstalledDataset: vi.fn(),
}));

vi.mock("@memora/datasets", () => ({
  deleteInstalledDataset,
  createHuggingFaceSource: vi.fn(),
  inspectDataset: vi.fn(),
  installDataset: vi.fn(),
  listInstalledDatasets: vi.fn(),
  openDataset: vi.fn(),
  resolveDatasetSplit: vi.fn(),
}));

class TestMessagePort {
  onmessage: ((event: MessageEvent<DatasetWorkerRequest>) => void) | null = null;
  readonly messages: unknown[] = [];
  readonly postMessage = vi.fn((message: unknown) => {
    this.messages.push(message);
  });
  readonly start = vi.fn();
}

const connectWorker = async (): Promise<TestMessagePort> => {
  const scope: { onconnect?: (event: MessageEvent) => void } = {};
  vi.stubGlobal("self", scope);
  await import("@/workers/dataset.shared-worker");
  const port = new TestMessagePort();
  scope.onconnect?.({ ports: [port] } as unknown as MessageEvent);
  return port;
};

const send = (port: TestMessagePort, request: DatasetWorkerRequest) =>
  port.onmessage?.({ data: request } as MessageEvent<DatasetWorkerRequest>);

const selection = {
  datasetId: "google/fleurs",
  revision: "abc123",
  configuration: "hi_in",
  split: "test",
};

describe("dataset shared worker reservations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    deleteInstalledDataset.mockResolvedValue(undefined);
  });

  it("rejects deleting a split while a reservation is held on it", async () => {
    const port = await connectWorker();

    send(port, { id: "reserve-1", type: "reserve", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));

    send(port, { id: "delete-1", type: "delete", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(2));

    expect(port.messages[1]).toMatchObject({
      id: "delete-1",
      type: "error",
      code: "dataset-in-use",
    });
    expect(deleteInstalledDataset).not.toHaveBeenCalled();
  });

  it("allows deleting a split once its reservation is released", async () => {
    const port = await connectWorker();

    send(port, { id: "reserve-1", type: "reserve", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));

    send(port, { id: "release-1", type: "release", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(2));

    send(port, { id: "delete-1", type: "delete", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(3));

    expect(port.messages[2]).toMatchObject({ id: "delete-1", type: "result", result: null });
    expect(deleteInstalledDataset).toHaveBeenCalledWith(selection);
  });

  it("keeps a split reserved while any of several overlapping reservations is still held", async () => {
    const port = await connectWorker();

    send(port, { id: "reserve-1", type: "reserve", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));
    send(port, { id: "reserve-2", type: "reserve", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(2));
    send(port, { id: "release-1", type: "release", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(3));

    send(port, { id: "delete-1", type: "delete", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(4));

    expect(port.messages[3]).toMatchObject({ id: "delete-1", type: "error", code: "dataset-in-use" });
  });

  it("does not confuse a different split with a reserved one", async () => {
    const port = await connectWorker();
    const otherSplit = { ...selection, split: "train" };

    send(port, { id: "reserve-1", type: "reserve", selection });
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));

    send(port, { id: "delete-1", type: "delete", selection: otherSplit });
    await vi.waitFor(() => expect(port.messages).toHaveLength(2));

    expect(port.messages[1]).toMatchObject({ id: "delete-1", type: "result", result: null });
    expect(deleteInstalledDataset).toHaveBeenCalledWith(otherSplit);
  });
});
