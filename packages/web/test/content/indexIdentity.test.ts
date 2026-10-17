import { expect, test } from "vite-plus/test";

import { getVectorDbContentHash, getVectorDbIndexId } from "@/lib/vector-db/indexIdentity";
import type { VectorDbIndexConfig } from "@/lib/vector-db/client";

const config: VectorDbIndexConfig = {
  model: "embeddinggemma-2",
  modelRevision: "test-v1",
  dimensions: 768,
  metric: "cosine",
  normalized: true,
  pooling: "mean",
  queryPrefix: "query: ",
  documentPrefix: "",
  chunkerName: "text",
  chunkerVersion: "1",
  chunkSize: 512,
  chunkOverlap: 64,
  segmenterLocale: "en",
  segmenterPipelineVersion: "1",
};

test("preserves persisted index IDs when configuration keys are reordered", async () => {
  // Recorded from the implementation before the shared hashing extraction.
  const expected = "0720cd0e5687dbf117500654";
  const reordered = Object.fromEntries(Object.entries(config).reverse()) as VectorDbIndexConfig;

  expect(await getVectorDbIndexId(config)).toBe(expected);
  expect(await getVectorDbIndexId(reordered)).toBe(expected);
});

test("preserves SHA-256 content fingerprints", async () => {
  expect(await getVectorDbContentHash("hello")).toBe(
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});
