import { file as opfsFile } from "@memora/fs";

import { buildBgeIndexConfig } from "@/lib/playground/vectorDbConfig";
import { LEXICAL_INDEX_CONFIG } from "@/lib/search/searchIndexConfig";
import {
  getVectorDbIndexId,
  getVectorDbSnapshotPath,
  type VectorDbIndexConfig,
} from "@/lib/vector-db";

// Lexical settings before segment-window-v2 (commit 7a28fba).
const LEXICAL_V1: VectorDbIndexConfig = {
  ...LEXICAL_INDEX_CONFIG,
  chunkerVersion: "segment-window-v1",
  chunkSize: 420,
  chunkOverlap: 60,
  segmenterPipelineVersion: "fts-v1",
};

// The content indexes earlier releases built: BGE semantic indexes on both lexical
// settings, and the first lexical index. Each lives in its own snapshot file that
// nothing opens any more. Playground indexes use other configurations and stay.
const legacyIndexConfigs = (): VectorDbIndexConfig[] => [
  LEXICAL_V1,
  ...[LEXICAL_V1, LEXICAL_INDEX_CONFIG].flatMap((lexical) =>
    (["bge-m3", "bge-small-en"] as const).map((model) => {
      const bge = buildBgeIndexConfig(model, lexical.chunkSize);
      return {
        ...lexical,
        model: `local:${bge.model}`,
        modelRevision: `${bge.modelRevision}:q8:content-v1`,
        dimensions: bge.dimensions,
        pooling: bge.pooling,
        queryPrefix: bge.queryPrefix,
        documentPrefix: bge.documentPrefix,
      };
    }),
  ),
];

export const removeLegacyContentIndexes = async (): Promise<void> => {
  for (const config of legacyIndexConfigs()) {
    const path = getVectorDbSnapshotPath(await getVectorDbIndexId(config));
    await opfsFile(path).remove({ force: true });
  }
};
