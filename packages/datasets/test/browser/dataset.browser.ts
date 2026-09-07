import { beforeEach, describe, expect, it } from "vitest";

import type {
  DatasetWorkerRequest,
  DatasetWorkerResponse,
  DatasetWorkerResult,
} from "../../../web/src/lib/playground/datasetWorkerProtocol";

import {
  DatasetError,
  createHuggingFaceSource,
  deleteInstalledDataset,
  inspectDataset,
  installDataset,
  listInstalledDatasets,
  openDataset,
  opfsDatasetStorage,
  type DatasetExample,
  type DatasetSource,
  type MediaReference,
} from "../../src/index";

const HUB_URL = `${location.origin}/hub`;
const DATASET_ID = "fixture/speech";

async function resetFixture(): Promise<void> {
  await fetch("/__dataset_fixture/reset");
  for (const installed of await listInstalledDatasets()) {
    await deleteInstalledDataset(installed);
  }
  await opfsDatasetStorage.remove("/memora/datasets/huggingface", { recursive: true });
}

async function inspectFixture() {
  return inspectDataset(DATASET_ID, {
    source: createHuggingFaceSource({ hubUrl: HUB_URL }),
  });
}

function requestWorker(
  port: MessagePort,
  request: DatasetWorkerRequest,
): Promise<DatasetWorkerResult> {
  return new Promise((resolve, reject) => {
    const receive = (event: MessageEvent<DatasetWorkerResponse>) => {
      if (event.data.id !== request.id || event.data.type === "progress") return;
      port.removeEventListener("message", receive);
      if (event.data.type === "error") reject(new Error(event.data.message));
      else resolve(event.data.result);
    };
    port.addEventListener("message", receive);
    port.postMessage(request);
  });
}

describe("Chromium dataset flow", () => {
  beforeEach(resetFixture);

  it("inspects with ranges, installs only the selected split, reuses OPFS and reads lazy media", async () => {
    const source = createHuggingFaceSource({ hubUrl: HUB_URL });
    const inspection = await inspectDataset(DATASET_ID, { source });
    expect(inspection.revision).toBe("fixture-commit-sha");
    expect(
      inspection.configurations[0]?.splits.map((split) => [split.name, split.examples]),
    ).toEqual([
      ["test", 3],
      ["train", 3],
    ]);
    expect(inspection.configurations[0]?.splits[0]?.features).toMatchObject({
      id: { type: "number" },
      transcription: { type: "string" },
      lang_id: { type: "classLabel", names: ["Hindi", "English"] },
      audio: { type: "audio", samplingRate: 16_000 },
    });

    const inspectionStats = (await fetch("/__dataset_fixture/stats").then((response) =>
      response.json(),
    )) as Record<string, number>;
    expect(inspectionStats["parquet-data/hi_in/test-00000-of-00001.parquet"]).toBeLessThan(
      inspection.configurations[0]?.splits[0]?.size ?? 0,
    );

    await fetch("/__dataset_fixture/reset");
    const progress: number[] = [];
    await installDataset(inspection, {
      source,
      configuration: "hi_in",
      splits: ["test"],
      onProgress: ({ completedBytes }) => progress.push(completedBytes),
    });
    const downloadStats = (await fetch("/__dataset_fixture/stats").then((response) =>
      response.json(),
    )) as Record<string, number>;
    expect(downloadStats["parquet-data/hi_in/test-00000-of-00001.parquet"]).toBeGreaterThanOrEqual(
      inspection.configurations[0]?.splits[0]?.size ?? 0,
    );
    expect(downloadStats["parquet-data/hi_in/train-00000-of-00001.parquet"]).toBeUndefined();
    expect(progress.at(-1)).toBe(inspection.configurations[0]?.splits[0]?.size);

    await installDataset(inspection, { source, configuration: "hi_in", splits: ["test"] });
    expect(await fetch("/__dataset_fixture/stats").then((response) => response.json())).toEqual(
      downloadStats,
    );

    const selection = {
      datasetId: DATASET_ID,
      revision: inspection.revision,
      configuration: "hi_in",
      split: "test",
    };
    const dataset = await openDataset(selection);
    const batches: DatasetExample[][] = [];
    for await (const batch of dataset.batches(2)) batches.push(batch);
    expect(batches.map((batch) => batch.map((example) => example.id))).toEqual([[2, 1], [3]]);
    const reference = batches[0]?.[0]?.audio as MediaReference;
    expect(reference).toMatchObject({ type: "media", mediaType: "audio" });
    const media = await dataset.readMedia(reference);
    expect(media.path).toBe("2.wav");
    expect(media.bytes[0]).toBe(2);
    dataset.close();

    await fetch("/__dataset_fixture/reset");
    const offline = await openDataset(selection);
    expect((await offline[Symbol.asyncIterator]().next()).value?.id).toBe(2);
    offline.close();
    await deleteInstalledDataset(selection);
    expect(await listInstalledDatasets()).toEqual([]);
  });

  it("isolates partial downloads, retries from the start, handles cancellation and quota errors", async () => {
    const inspection = await inspectFixture();
    const httpSource = createHuggingFaceSource({ hubUrl: HUB_URL });
    let failOnce = true;
    const source: DatasetSource = {
      inspect: (datasetId, revision, signal) => httpSource.inspect(datasetId, revision, signal),
      async download(file, selection, signal) {
        const stream = await httpSource.download(file, selection, signal);
        if (!failOnce) return stream;
        failOnce = false;
        const reader = stream.getReader();
        return new ReadableStream({
          async pull(controller) {
            const chunk = await reader.read();
            if (!chunk.done)
              controller.enqueue(chunk.value.slice(0, Math.max(1, chunk.value.byteLength / 2)));
            controller.error(new Error("fixture connection failed"));
          },
          cancel: (reason) => reader.cancel(reason),
        });
      },
    };
    const installOptions = { source, configuration: "hi_in", splits: ["test"] };
    await expect(installDataset(inspection, installOptions)).rejects.toMatchObject({
      code: "network",
    });
    expect(await listInstalledDatasets()).toEqual([]);
    await installDataset(inspection, installOptions);
    expect(await listInstalledDatasets()).toHaveLength(1);

    await resetFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      installDataset(inspection, { ...installOptions, signal: controller.signal }),
    ).rejects.toEqual(expect.objectContaining<Partial<DatasetError>>({ code: "aborted" }));
    expect(await listInstalledDatasets()).toEqual([]);

    const quotaStorage = {
      ...opfsDatasetStorage,
      estimate: async () => ({ quota: 1, usage: 0 }),
    };
    await expect(
      installDataset(inspection, { ...installOptions, storage: quotaStorage }),
    ).rejects.toMatchObject({ code: "quota" });
    expect(await listInstalledDatasets()).toEqual([]);
  });

  it("runs inspect, install and bounded reads through the SharedWorker boundary", async () => {
    const worker = new SharedWorker(
      new URL("../../../web/src/workers/dataset.shared-worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.port.start();
    const inspection = (await requestWorker(worker.port, {
      id: "inspect",
      type: "inspect",
      datasetId: DATASET_ID,
      hubUrl: HUB_URL,
    })) as Awaited<ReturnType<typeof inspectFixture>>;
    await requestWorker(worker.port, {
      id: "install",
      type: "install",
      inspection,
      configuration: "hi_in",
      splits: ["test"],
      hubUrl: HUB_URL,
    });
    const opened = (await requestWorker(worker.port, {
      id: "open",
      type: "open",
      selection: {
        datasetId: DATASET_ID,
        revision: inspection.revision,
        configuration: "hi_in",
        split: "test",
      },
    })) as { handleId: string; length: number };
    expect(opened.length).toBe(3);
    const examples = (await requestWorker(worker.port, {
      id: "next",
      type: "next",
      handleId: opened.handleId,
      count: 2,
    })) as DatasetExample[];
    expect(examples.map((example) => example.id)).toEqual([2, 1]);
    const media = (await requestWorker(worker.port, {
      id: "media",
      type: "media",
      handleId: opened.handleId,
      reference: examples[0]?.audio as MediaReference,
    })) as { bytes: Uint8Array };
    expect(media.bytes[0]).toBe(2);
    await requestWorker(worker.port, {
      id: "close",
      type: "close",
      handleId: opened.handleId,
    });
    worker.port.close();
  });

  it("cancels an active SharedWorker download and retries without exposing a partial", async () => {
    const inspection = await inspectFixture();
    const worker = new SharedWorker(
      new URL("../../../web/src/workers/dataset.shared-worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.port.start();
    const installing = requestWorker(worker.port, {
      id: "slow-install",
      type: "install",
      inspection,
      configuration: "hi_in",
      splits: ["test"],
      hubUrl: `${location.origin}/hub-slow`,
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await requestWorker(worker.port, {
      id: "cancel",
      type: "cancel",
      targetId: "slow-install",
    });
    await expect(installing).rejects.toThrow();
    expect(await requestWorker(worker.port, { id: "list-after-cancel", type: "list" })).toEqual([]);

    await requestWorker(worker.port, {
      id: "retry",
      type: "install",
      inspection,
      configuration: "hi_in",
      splits: ["test"],
      hubUrl: HUB_URL,
    });
    expect(await requestWorker(worker.port, { id: "list-after-retry", type: "list" })).toHaveLength(
      1,
    );
    worker.port.close();
  });
});
