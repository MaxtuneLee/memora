import { describe, expect, it, vi } from "vitest";

import {
  DatasetError,
  installDataset,
  listInstalledDatasets,
  openDataset,
  resolveDatasetSplit,
  type DatasetInspection,
  type DatasetSource,
  type DatasetStorage,
  type FeatureSchema,
  type MediaReference,
  type ParquetReader,
} from "../src/index";

class MemoryStorage implements DatasetStorage {
  readonly files = new Map<string, Uint8Array>();
  quota = 10_000;
  failWriteWith?: DOMException;

  async exists(path: string) {
    return this.files.has(path);
  }
  async readText(path: string) {
    return new TextDecoder().decode(this.require(path));
  }
  async readFile(path: string) {
    return new File([Uint8Array.from(this.require(path)).buffer], path);
  }
  async size(path: string) {
    return this.require(path).byteLength;
  }
  async write(path: string, data: string | ReadableStream<Uint8Array>) {
    if (this.failWriteWith) throw this.failWriteWith;
    if (typeof data === "string") {
      this.files.set(path, new TextEncoder().encode(data));
      return;
    }
    const chunks: Uint8Array[] = [];
    const reader = data.getReader();
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      chunks.push(item.value);
    }
    const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.files.set(path, output);
  }
  async remove(path: string, options?: { recursive?: boolean }) {
    if (options?.recursive)
      for (const key of this.files.keys()) if (key.startsWith(`${path}/`)) this.files.delete(key);
    this.files.delete(path);
  }
  async list(path: string) {
    return [...this.files.keys()].filter((key) => key.startsWith(path));
  }
  async estimate() {
    return {
      quota: this.quota,
      usage: [...this.files.values()].reduce((sum, value) => sum + value.byteLength, 0),
    };
  }
  private require(path: string) {
    const value = this.files.get(path);
    if (!value) throw new DOMException("Missing", "NotFoundError");
    return value;
  }
}

const inspection: DatasetInspection = {
  source: "huggingface",
  datasetId: "fixture/speech",
  requestedRevision: "main",
  revision: "abc123",
  configurations: [
    {
      name: "hi_in",
      size: 4,
      splits: [
        {
          name: "test",
          size: 4,
          examples: 3,
          files: [{ path: "parquet-data/hi_in/test/0000.parquet", size: 4, examples: 3 }],
          features: {
            id: { type: "number" },
            transcription: { type: "string" },
            lang_id: { type: "classLabel", names: ["hi_in"] },
            audio: { type: "audio", samplingRate: 16_000 },
          },
        },
      ],
    },
  ],
};

function fixture() {
  const storage = new MemoryStorage();
  const download = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3, 4])]).stream());
  const resolveSplit = vi.fn();
  const source: DatasetSource = { inspect: vi.fn(), resolveSplit, download };
  const examples = [
    {
      id: 2,
      transcription: "second",
      lang_id: 0,
      audio: { path: "2.wav", bytes: new Uint8Array([2]) },
    },
    {
      id: 1,
      transcription: "first",
      lang_id: 0,
      audio: { path: "1.wav", bytes: new Uint8Array([1]) },
    },
    {
      id: 3,
      transcription: "third",
      lang_id: 0,
      audio: { path: "3.wav", bytes: new Uint8Array([3]) },
    },
  ];
  const reader: ParquetReader = {
    metadata: vi.fn(async () => ({
      examples: 3,
      features: inspection.configurations[0].splits[0].features,
    })),
    examples: vi.fn(async (_file, options) =>
      examples
        .slice(options.start, options.end)
        .map((example) =>
          Object.fromEntries(
            Object.entries(example).filter(
              ([key]) => !options.columns || options.columns.includes(key),
            ),
          ),
        ),
    ),
  };
  return { storage, source, reader, download, resolveSplit };
}

describe("installed datasets", () => {
  it("installs once, opens offline, preserves source order and keeps the tail batch", async () => {
    const deps = fixture();
    const progress = vi.fn();
    await installDataset(inspection, {
      ...deps,
      configuration: "hi_in",
      splits: ["test"],
      onProgress: progress,
    });
    await installDataset(inspection, { ...deps, configuration: "hi_in", splits: ["test"] });
    expect(deps.download).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ completedBytes: 4, totalBytes: 4 }),
    );
    expect(await listInstalledDatasets(deps)).toHaveLength(1);

    const dataset = await openDataset(
      { datasetId: "fixture/speech", revision: "abc123", configuration: "hi_in", split: "test" },
      deps,
    );
    const batches = [];
    for await (const batch of dataset.batches(2)) batches.push(batch);
    expect(batches.map((batch) => batch.map((example) => example.id))).toEqual([[2, 1], [3]]);
    expect(batches[0][0].audio).toMatchObject({ type: "media", mediaType: "audio" });
    expect(await dataset.readMedia(batches[0][0].audio as MediaReference)).toMatchObject({
      path: "2.wav",
      mimeType: "audio/wav",
      bytes: new Uint8Array([2]),
    });
    dataset.close();
  });

  it("does not expose partial files and retries the current file from the start", async () => {
    const deps = fixture();
    deps.download.mockRejectedValueOnce(new Error("offline"));
    await expect(
      installDataset(inspection, { ...deps, configuration: "hi_in", splits: ["test"] }),
    ).rejects.toMatchObject({ code: "network" });
    expect(await listInstalledDatasets(deps)).toEqual([]);
    await installDataset(inspection, { ...deps, configuration: "hi_in", splits: ["test"] });
    expect(deps.download).toHaveBeenCalledTimes(2);
  });

  it("reports cancellation and quota failures with stable error codes", async () => {
    const canceled = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      installDataset(inspection, {
        ...canceled,
        configuration: "hi_in",
        splits: ["test"],
        signal: controller.signal,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<DatasetError>>({ code: "aborted" }));

    const full = fixture();
    full.storage.quota = 3;
    await expect(
      installDataset(inspection, { ...full, configuration: "hi_in", splits: ["test"] }),
    ).rejects.toMatchObject({ code: "quota" });
  });

  it("resolves example counts and features from the downloaded shard, not from inspection", async () => {
    const deps = fixture();
    const leanInspection: DatasetInspection = {
      ...inspection,
      configurations: [
        {
          ...inspection.configurations[0],
          splits: [
            { ...inspection.configurations[0].splits[0], examples: undefined, features: {} },
          ],
        },
      ],
    };
    await installDataset(leanInspection, { ...deps, configuration: "hi_in", splits: ["test"] });
    expect(await listInstalledDatasets(deps)).toMatchObject([{ examples: 3 }]);
    const manifestPath = [...deps.storage.files.keys()].find((path) =>
      path.endsWith("manifest.json"),
    );
    if (!manifestPath) throw new Error("Expected an installed manifest.");
    const manifest = JSON.parse(await deps.storage.readText(manifestPath)) as {
      features: FeatureSchema;
    };
    expect(manifest.features).toEqual(inspection.configurations[0].splits[0].features);
  });

  it("checks quota only for shards that are not reusable", async () => {
    const deps = fixture();
    const split = inspection.configurations[0].splits[0];
    const multiShardInspection: DatasetInspection = {
      ...inspection,
      configurations: [
        {
          ...inspection.configurations[0],
          size: 8,
          splits: [
            {
              ...split,
              size: 8,
              examples: 6,
              files: [
                split.files[0],
                { ...split.files[0], path: "parquet-data/hi_in/test/0001.parquet" },
              ],
            },
          ],
        },
      ],
    };
    const options = { ...deps, configuration: "hi_in", splits: ["test"] };
    await installDataset(multiShardInspection, options);
    const manifest = [...deps.storage.files.keys()].find((path) => path.endsWith("manifest.json"));
    const secondShard = [...deps.storage.files.keys()].find((path) =>
      path.endsWith("00001.parquet"),
    );
    expect(manifest).toBeDefined();
    expect(secondShard).toBeDefined();
    if (!manifest || !secondShard) throw new Error("Expected installed fixture files.");
    await deps.storage.remove(manifest);
    await deps.storage.remove(secondShard);
    deps.storage.quota = 8;

    await installDataset(multiShardInspection, options);
    expect(deps.download).toHaveBeenCalledTimes(3);
  });
});

describe("resolveDatasetSplit", () => {
  it("resolves only the requested split, leaving other configurations untouched", async () => {
    const deps = fixture();
    const resolvedSplit = {
      ...inspection.configurations[0].splits[0],
      examples: 3,
      features: inspection.configurations[0].splits[0].features,
    };
    deps.resolveSplit.mockResolvedValue(resolvedSplit);
    const leanInspection: DatasetInspection = {
      ...inspection,
      configurations: [
        {
          ...inspection.configurations[0],
          splits: [
            { ...inspection.configurations[0].splits[0], examples: undefined, features: {} },
          ],
        },
      ],
    };

    const resolved = await resolveDatasetSplit(leanInspection, "hi_in", "test", deps);

    expect(deps.resolveSplit).toHaveBeenCalledWith(
      leanInspection.datasetId,
      leanInspection.revision,
      leanInspection.configurations[0].splits[0],
      undefined,
    );
    expect(resolved.configurations[0].splits[0]).toEqual(resolvedSplit);
  });

  it("skips the network call once a split is already resolved", async () => {
    const deps = fixture();
    const resolved = await resolveDatasetSplit(inspection, "hi_in", "test", deps);
    expect(deps.resolveSplit).not.toHaveBeenCalled();
    expect(resolved).toBe(inspection);
  });
});
