import { describe, expect, it, vi } from "vitest";

const downloadFile = vi.fn();
const fileDownloadInfo = vi.fn();
const asyncBufferFromUrl = vi.fn();

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
  parquetReader: {
    metadata: vi.fn(async () => ({ examples: 3, features: { id: { type: "number" } } })),
  },
}));

const { createHuggingFaceSource } = await import("../src/hub");

describe("createHuggingFaceSource().inspect", () => {
  it("reads only Parquet footers via ranged URLs, never the full file body", async () => {
    fileDownloadInfo.mockImplementation(async ({ path }: { path: string }) => ({
      size: path.includes("hi_in") ? 40 : 50,
      etag: "etag",
      url: `https://huggingface.co/datasets/fixture/repo/resolve/main/${path}`,
    }));

    const source = createHuggingFaceSource();
    const inspection = await source.inspect("fixture/repo", "main");

    expect(downloadFile).not.toHaveBeenCalled();
    expect(fileDownloadInfo).toHaveBeenCalledTimes(2);
    expect(asyncBufferFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://huggingface.co/datasets/fixture/repo/resolve/main/parquet-data/hi_in/test/0000.parquet",
        byteLength: 40,
      }),
    );
    expect(inspection.configurations.map((configuration) => configuration.name)).toEqual([
      "fr_fr",
      "hi_in",
    ]);
    expect(inspection.configurations[0].splits[0].examples).toBe(3);
  });
});
