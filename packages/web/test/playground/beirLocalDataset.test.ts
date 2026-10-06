import { createHash } from "node:crypto";
import { expect, test, vi } from "vite-plus/test";
import {
  loadBeirSourceBundle,
  validateBeirQrelReferences,
  validateBeirSourceBundle,
  type BeirSourceBundle,
} from "../../src/lib/playground/beirLocalDataset";

const hash = async (value: string) => createHash("sha256").update(value).digest("hex");
async function fixture(): Promise<BeirSourceBundle> {
  const revision = "a".repeat(40),
    digest = "b".repeat(64);
  const corpus = Array.from({ length: 3633 }, (_, i) => ({
    _id: "d" + i,
    title: "title",
    text: "document",
  }));
  const queries = Array.from({ length: 3237 }, (_, i) => ({ _id: "q" + i, text: "query" }));
  const qrels = Array.from({ length: 12334 }, (_, i) => ({
    "query-id": "q" + (i % 323),
    "corpus-id": "d" + Math.floor(i / 323),
    score: 1,
  }));
  return {
    kind: "beir-source-bundle",
    formatVersion: 1,
    dataset: "nfcorpus",
    source: "test fixture",
    hubRevision: revision,
    qrelsHubRevision: revision,
    hubRevisionStableDuringDownload: true,
    corpus,
    queries,
    qrels,
    missingQrelDocuments: [],
    counts: { corpus: 3633, allQueries: 3237, testQueries: 323, qrels: 12334 },
    hashes: {
      corpus: await hash(JSON.stringify(corpus)),
      allQueries: await hash(JSON.stringify(queries)),
      qrels: await hash(JSON.stringify(qrels)),
    },
    sourceFiles: [
      "corpus/corpus-00000-of-00001.parquet",
      "queries/queries-00000-of-00001.parquet",
      "test.tsv",
    ].map((path) => {
      const repository = path === "test.tsv" ? "BeIR/nfcorpus-qrels" : "BeIR/nfcorpus";
      return {
        repository,
        revision,
        path,
        url: `https://huggingface.co/datasets/${repository}/resolve/${revision}/${path}`,
        bytes: 1,
        sha256: digest,
        gitBlobSha1: "c".repeat(40),
        officialLfsSha256: digest,
        officialGitBlobSha1: null,
      };
    }),
  };
}

test("accepts a complete pinned bundle and rejects changed content", async () => {
  const bundle = await fixture();
  await expect(validateBeirSourceBundle("nfcorpus", bundle, hash)).resolves.toBe(bundle);
  bundle.corpus[0].text = "changed after download";
  await expect(validateBeirSourceBundle("nfcorpus", bundle, hash)).rejects.toThrow(
    "digest mismatch",
  );
});

test("rejects unexpected qrel references and unpinned source files", async () => {
  const bundle = await fixture();
  bundle.qrels[0]["corpus-id"] = "missing";
  await expect(validateBeirSourceBundle("nfcorpus", bundle, hash)).rejects.toThrow(
    "absent from corpus",
  );
  const unpinned = await fixture();
  unpinned.sourceFiles[0].url = unpinned.sourceFiles[0].url.replace(unpinned.hubRevision, "main");
  await expect(validateBeirSourceBundle("nfcorpus", unpinned, hash)).rejects.toThrow(
    "source-file evidence",
  );
});

test("retains only the five verified ArguAna missing positive pairs", () => {
  const rows = [
    "test-free-speech-debate-yfsdfkhbwu-con03",
    "test-education-ufsdfkhbwu-con03",
    "test-politics-dhwem-pro06",
    "test-science-sghwbdgmo-con03",
    "test-society-asfhwapg-con04",
  ].map((prefix) => ({ "query-id": prefix + "a", "corpus-id": prefix + "b", score: 1 }));
  expect(validateBeirQrelReferences("arguana", [], rows)).toEqual(rows);
  expect(() => validateBeirQrelReferences("nfcorpus", [], rows)).toThrow("absent from corpus");
  expect(() => validateBeirQrelReferences("arguana", [], [{ ...rows[0], score: 2 }])).toThrow(
    "absent from corpus",
  );
  expect(() =>
    validateBeirQrelReferences("arguana", [], [{ ...rows[0], "corpus-id": "other" }]),
  ).toThrow("absent from corpus");
});

test("only a missing local file falls back to the download path", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
  await expect(loadBeirSourceBundle("nfcorpus", { hash, fetcher })).resolves.toBeNull();
  fetcher.mockResolvedValue(new Response(null, { status: 500 }));
  await expect(loadBeirSourceBundle("nfcorpus", { hash, fetcher })).rejects.toThrow("HTTP 500");
  fetcher.mockResolvedValue(Response.json({ kind: "broken" }));
  await expect(loadBeirSourceBundle("nfcorpus", { hash, fetcher })).rejects.toThrow();
});
