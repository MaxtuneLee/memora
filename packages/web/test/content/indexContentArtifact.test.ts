import { expect, test } from "vite-plus/test";

import { indexContentArtifactSemantically } from "@/lib/content/indexContentArtifact";
import type { ContentArtifact } from "@/lib/content/types";
import type { EmbeddingRuntime } from "@/lib/models/embeddingRuntime";
import { LEXICAL_INDEX_CONFIG } from "@/lib/search/searchIndexConfig";
import type { VectorDbIndexClient, VectorDbIndexedChunk } from "@/lib/vector-db";

const artifact: ContentArtifact = {
  schemaVersion: 1,
  fileId: "photo",
  sourceRevision: "rev",
  parser: { name: "image", version: "image-v1" },
  title: "whiteboard",
  markdown: "Quarterly goals",
  plainText: "Quarterly goals",
  segments: [
    {
      id: "s1",
      kind: "text",
      text: "Quarterly goals",
      headingPath: [],
      locator: { kind: "image" },
      searchable: true,
    },
  ],
  warnings: [],
  createdAt: 0,
};

test("indexes an image as its OCR text chunks plus one image embedding", async () => {
  const stored: VectorDbIndexedChunk[] = [];
  const vectorDb = {
    prepareDocument: async () => ({ complete: false, persistedChunkIds: [] }),
    upsertChunkBatch: async ({ chunks }: { chunks: VectorDbIndexedChunk[] }) => {
      stored.push(...chunks);
    },
    finalizeDocument: async () => {},
  } as unknown as VectorDbIndexClient;
  const image = new Blob(["pixels"], { type: "image/png" });
  const embeddedImages: Blob[] = [];
  const runtime: EmbeddingRuntime = {
    indexConfig: { ...LEXICAL_INDEX_CONFIG, dimensions: 2 },
    embed: async (texts) => texts.map(() => Float32Array.of(1, 0)),
    embedImages: async (images) => {
      embeddedImages.push(...images);
      return images.map(() => Float32Array.of(0, 1));
    },
  };

  const { chunkCount } = await indexContentArtifactSemantically(vectorDb, artifact, runtime, {
    image,
  });

  expect(chunkCount).toBe(2);
  expect(embeddedImages).toEqual([image]);
  const [text, picture] = stored;
  expect(text?.content).toContain("Quarterly goals");
  expect(Array.from(text?.embedding ?? [])).toEqual([1, 0]);
  expect(picture).toMatchObject({
    chunkId: "photo:image",
    chunkIndex: 2,
    locator: { kind: "image" },
  });
  expect(picture?.content).toBe("whiteboard — Quarterly goals");
  expect(Array.from(picture?.embedding ?? [])).toEqual([0, 1]);
});
