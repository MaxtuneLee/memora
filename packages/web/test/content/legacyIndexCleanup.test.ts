import { expect, test, vi } from "vite-plus/test";

const removed: string[] = [];
vi.mock("@memora/fs", () => ({
  file: (path: string) => ({
    remove: async () => {
      removed.push(path);
    },
  }),
}));

const { removeLegacyContentIndexes } = await import("@/lib/content/legacyIndexCleanup");
const { createEmbeddingRuntime } = await import("@/lib/models/embeddingRuntime");
const { LEXICAL_INDEX_CONFIG } = await import("@/lib/search/searchIndexConfig");
const { getVectorDbIndexId, getVectorDbSnapshotPath } = await import("@/lib/vector-db");

test("removes the old BGE content indexes and keeps the current ones", async () => {
  await removeLegacyContentIndexes();
  const snapshot = async (config: Parameters<typeof getVectorDbIndexId>[0]) =>
    getVectorDbSnapshotPath(await getVectorDbIndexId(config));
  const gemma = createEmbeddingRuntime({ source: "local", modelId: "embeddinggemma-2" });

  expect(removed).toHaveLength(5);
  expect(removed).not.toContain(await snapshot(LEXICAL_INDEX_CONFIG));
  expect(removed).not.toContain(await snapshot(gemma.indexConfig));
  // The BGE-M3 index the previous release built.
  expect(removed).toContain(
    await snapshot({
      ...LEXICAL_INDEX_CONFIG,
      model: "local:bge-m3",
      modelRevision: "Xenova/bge-m3:q8:content-v1",
      dimensions: 1024,
      pooling: "cls",
      queryPrefix: "",
      documentPrefix: "",
    }),
  );
});
