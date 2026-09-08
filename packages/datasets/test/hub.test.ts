import { describe, expect, it, vi } from "vitest";

const downloadFile = vi.fn();
const fileDownloadInfo = vi.fn();
const asyncBufferFromUrl = vi.fn();
const parquetMetadata = vi.fn();

vi.mock("@huggingface/hub", () => ({
  datasetInfo: vi.fn(async () => ({ sha: "revision-sha", cardData: undefined })),
  downloadFile,
  fileDownloadInfo,
  globMatch: () => false,
  listFiles: async function* () {
    yield {
      type: "file",
      path: "parquet-data/hi_in/test/0000.parquet",
      size: 40,
      oid: "etag-hi-test",
    };
    yield {
      type: "file",
      path: "parquet-data/fr_fr/test/0000.parquet",
      size: 50,
      oid: "etag-fr-test",
    };
  },
}));

vi.mock("hyparquet", () => ({
  asyncBufferFromUrl,
}));

vi.mock("../src/parquet", () => ({
  parquetReader: { metadata: parquetMetadata },
}));

const { createHuggingFaceSource } = await import("../src/hub");

describe("createHuggingFaceSource().inspect", () => {
  it("only lists Hub files, never fetches file bodies or Parquet metadata", async () => {
    const source = createHuggingFaceSource();
    const inspection = await source.inspect("fixture/repo", "main");

    expect(downloadFile).not.toHaveBeenCalled();
    expect(fileDownloadInfo).not.toHaveBeenCalled();
    expect(asyncBufferFromUrl).not.toHaveBeenCalled();
    expect(parquetMetadata).not.toHaveBeenCalled();

    expect(inspection.configurations.map((configuration) => configuration.name)).toEqual([
      "fr_fr",
      "hi_in",
    ]);
    for (const configuration of inspection.configurations) {
      for (const split of configuration.splits) {
        expect(split.examples).toBeUndefined();
        expect(split.features).toEqual({});
      }
    }
    expect(inspection.configurations[1].splits[0].size).toBe(40);
  });
});

describe("createHuggingFaceSource().resolveSplit", () => {
  it("reads only the requested split's footers via ranged URLs, never the full file body", async () => {
    fileDownloadInfo.mockImplementation(async ({ path }: { path: string }) => ({
      size: 40,
      etag: "etag",
      url: `https://huggingface.co/datasets/fixture/repo/resolve/main/${path}`,
    }));
    parquetMetadata.mockResolvedValue({ examples: 3, features: { id: { type: "number" } } });

    const source = createHuggingFaceSource();
    const split = await source.resolveSplit("fixture/repo", "revision-sha", {
      name: "test",
      examples: undefined,
      size: 40,
      features: {},
      files: [{ path: "parquet-data/hi_in/test/0000.parquet", size: 40 }],
    });

    expect(downloadFile).not.toHaveBeenCalled();
    expect(fileDownloadInfo).toHaveBeenCalledTimes(1);
    expect(asyncBufferFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://huggingface.co/datasets/fixture/repo/resolve/main/parquet-data/hi_in/test/0000.parquet",
        byteLength: 40,
      }),
    );
    expect(split.examples).toBe(3);
    expect(split.features).toEqual({ id: { type: "number" } });
  });
});
