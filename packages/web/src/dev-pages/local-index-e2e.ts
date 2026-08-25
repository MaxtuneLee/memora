import {
  getPlaygroundContentHash,
  PlaygroundLocalIndex,
  type PlaygroundIndexConfig,
  type PlaygroundDocumentIndexPlan,
  type PlaygroundIndexedDocument,
  type PlaygroundSearchHit,
} from "../lib/playground/localIndex";

interface E2eReport {
  passed: boolean;
  runId: string;
  initialized: {
    indexId: string;
    sqliteVersion: string;
    sqliteVecVersion: string;
    persistent: boolean;
  };
  indexed: {
    documentIds: string[];
    documentCount: number;
    chunkCount: number;
  };
  checkpoint: {
    persistedBeforeClose: number;
    resumedAfterReopen: number;
    partialDocumentWasHidden: boolean;
  };
  lexicalResults: PlaygroundSearchHit[];
  vectorResults: PlaygroundSearchHit[];
  hybridResults: PlaygroundSearchHit[];
  reopened: {
    persistent: boolean;
    documentCount: number;
    chunkCount: number;
    topDocumentId: string;
  };
}

const config: PlaygroundIndexConfig = {
  model: "bge-small-en",
  modelRevision: "local-index-e2e-deterministic-v1",
  dimensions: 4,
  metric: "cosine",
  normalized: true,
  pooling: "mean",
  queryPrefix: "Represent this sentence for searching relevant passages: ",
  documentPrefix: "",
  chunkerName: "transcript-characters",
  chunkerVersion: "1",
  chunkSize: 160,
  chunkOverlap: 20,
  segmenterLocale: "en",
  segmenterPipelineVersion: "1",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const createDocument = async (
  documentId: string,
  content: string,
  embedding: number[],
): Promise<PlaygroundIndexedDocument> => {
  const contentHash = await getPlaygroundContentHash(content);
  return {
    documentId,
    contentHash,
    indexedAt: Date.now(),
    chunks: [
      {
        chunkId: `${documentId}:0`,
        documentId,
        chunkIndex: 0,
        content,
        contentHash,
        tokenCount: content.split(/\s+/u).length,
        headingPath: ["E2E"],
        embedding: new Float32Array(embedding),
      },
    ],
  };
};

const run = async (): Promise<E2eReport> => {
  const runId = crypto.randomUUID();
  const alphaDocumentId = `e2e-alpha-${runId}`;
  const betaDocumentId = `e2e-beta-${runId}`;
  const documentIds = [alphaDocumentId, betaDocumentId];
  const alphaDocument = await createDocument(
    alphaDocumentId,
    `alpha schedule ${runId}: the project review is Tuesday morning`,
    [1, 0, 0, 0],
  );
  const alphaSecondContent = `alpha follow-up ${runId}: final review notes`;
  alphaDocument.contentHash = await getPlaygroundContentHash(
    `${alphaDocument.chunks[0]?.content}\n${alphaSecondContent}`,
  );
  alphaDocument.chunks.push({
    chunkId: `${alphaDocumentId}:1`,
    documentId: alphaDocumentId,
    chunkIndex: 1,
    content: alphaSecondContent,
    contentHash: await getPlaygroundContentHash(alphaSecondContent),
    tokenCount: alphaSecondContent.split(/\s+/u).length,
    headingPath: ["E2E"],
    embedding: new Float32Array([0.8, 0.2, 0, 0]),
  });
  const betaDocument = await createDocument(
    betaDocumentId,
    `beta recipe ${runId}: roast vegetables with olive oil`,
    [0, 1, 0, 0],
  );
  const index = new PlaygroundLocalIndex();

  const initialized = await index.initialize(config);
  assert(initialized.persistent, "The SQLite database did not open through OPFS.");
  const alphaPlan: PlaygroundDocumentIndexPlan = {
    documentId: alphaDocument.documentId,
    contentHash: alphaDocument.contentHash,
    indexedAt: alphaDocument.indexedAt,
    chunks: alphaDocument.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      contentHash: chunk.contentHash,
    })),
  };
  await index.prepareDocument(alphaPlan);
  const firstCheckpoint = await index.upsertChunkBatch({
    documentId: alphaDocument.documentId,
    contentHash: alphaDocument.contentHash,
    chunks: alphaDocument.chunks.slice(0, 1),
  });
  assert(firstCheckpoint.persistedChunkCount === 1, "The first checkpoint was not persisted.");
  await index.close();

  const reopenedIndex = new PlaygroundLocalIndex();
  const reopenedAfterCheckpoint = await reopenedIndex.initialize(config);
  assert(
    reopenedAfterCheckpoint.persistent,
    "The checkpoint database did not reopen through OPFS.",
  );
  const resumedCheckpoint = await reopenedIndex.prepareDocument(alphaPlan);
  assert(
    resumedCheckpoint.persistedChunkIds.length === 1 &&
      resumedCheckpoint.persistedChunkIds[0] === alphaDocument.chunks[0]?.chunkId,
    "The persisted chunk checkpoint was not recovered after reopening OPFS.",
  );
  const partialResults = await reopenedIndex.search({
    query: `alpha schedule ${runId}`,
    queryEmbedding: new Float32Array([1, 0, 0, 0]),
    scope: { kind: "documents", documentIds: [alphaDocumentId] },
    topK: 2,
  });
  assert(partialResults.length === 0, "An incomplete document was visible to retrieval.");
  await reopenedIndex.upsertChunkBatch({
    documentId: alphaDocument.documentId,
    contentHash: alphaDocument.contentHash,
    chunks: alphaDocument.chunks.slice(1),
  });
  await reopenedIndex.finalizeDocument(alphaPlan);
  await reopenedIndex.upsertDocument(betaDocument);
  const indexedHealth = await reopenedIndex.health();

  const scope = { kind: "documents", documentIds } as const;
  const lexicalResults = await reopenedIndex.search({
    query: `alpha schedule ${runId}`,
    scope,
    topK: 2,
  });
  const vectorResults = await reopenedIndex.search({
    query: "",
    queryEmbedding: new Float32Array([1, 0, 0, 0]),
    scope,
    topK: 2,
  });
  const hybridResults = await reopenedIndex.search({
    query: `alpha schedule ${runId}`,
    queryEmbedding: new Float32Array([1, 0, 0, 0]),
    scope,
    topK: 2,
  });
  const thresholdResults = await reopenedIndex.search({
    query: `alpha schedule ${runId}`,
    queryEmbedding: new Float32Array([1, 0, 0, 0]),
    scope,
    topK: 2,
    maxVectorDistance: 0.2,
  });

  assert(lexicalResults[0]?.documentId === alphaDocumentId, "FTS5 returned the wrong top result.");
  assert(
    vectorResults[0]?.documentId === alphaDocumentId,
    "sqlite-vec returned the wrong top result.",
  );
  assert(
    hybridResults[0]?.documentId === alphaDocumentId,
    "Hybrid RRF returned the wrong top result.",
  );
  assert(
    hybridResults[0]?.lexicalRank !== undefined &&
      hybridResults[0]?.semanticRank !== undefined,
    "The top hybrid result did not include both lexical and semantic ranks.",
  );
  assert(
    thresholdResults.length > 0 &&
      thresholdResults.every((result) => result.documentId === alphaDocumentId),
    "The vector distance threshold did not remove the irrelevant result.",
  );

  await reopenedIndex.close();
  const finalIndex = new PlaygroundLocalIndex();
  const reopenedHealth = await finalIndex.initialize(config);
  const reopenedResults = await finalIndex.search({
    query: `alpha schedule ${runId}`,
    queryEmbedding: new Float32Array([1, 0, 0, 0]),
    scope,
    topK: 1,
  });
  assert(reopenedHealth.persistent, "The reopened database is not persistent.");
  assert(
    reopenedResults[0]?.documentId === alphaDocumentId,
    "The indexed rows were not retrievable after reopening the OPFS database.",
  );
  await finalIndex.close();

  return {
    passed: true,
    runId,
    initialized: {
      indexId: initialized.indexId,
      sqliteVersion: initialized.sqliteVersion,
      sqliteVecVersion: initialized.sqliteVecVersion,
      persistent: initialized.persistent,
    },
    indexed: {
      documentIds,
      documentCount: indexedHealth.documentCount,
      chunkCount: indexedHealth.chunkCount,
    },
    checkpoint: {
      persistedBeforeClose: firstCheckpoint.persistedChunkCount,
      resumedAfterReopen: resumedCheckpoint.persistedChunkIds.length,
      partialDocumentWasHidden: partialResults.length === 0,
    },
    lexicalResults,
    vectorResults,
    hybridResults,
    reopened: {
      persistent: reopenedHealth.persistent,
      documentCount: reopenedHealth.documentCount,
      chunkCount: reopenedHealth.chunkCount,
      topDocumentId: reopenedResults[0].documentId,
    },
  };
};

const status = document.querySelector<HTMLParagraphElement>("#status");
const result = document.querySelector<HTMLPreElement>("#result");

void run()
  .then((report) => {
    if (status) {
      status.dataset.state = "passed";
      status.textContent = "Passed";
    }
    if (result) result.textContent = JSON.stringify(report, null, 2);
    document.title = "PASS · Local index E2E";
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
        : String(error);
    if (status) {
      status.dataset.state = "failed";
      status.textContent = "Failed";
    }
    if (result) result.textContent = message;
    document.title = "FAIL · Local index E2E";
  });
