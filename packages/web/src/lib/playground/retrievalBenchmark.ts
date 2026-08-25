export interface RetrievalBenchmarkCase {
  id: string;
  datasetId: string;
  query: string;
  relevantDocumentIds: string[];
}

export interface RetrievalBenchmarkCaseResult {
  id: string;
  datasetId: string;
  query: string;
  relevantCount: number;
  relevantRetrievedAt10: number;
  firstRelevantRank: number | null;
  reciprocalRank: number;
  recallAt10: number;
  hitAt10: boolean;
  ndcgAt10: number;
  latencyMs: number;
}

export interface RetrievalBenchmarkReport {
  mrr: number;
  recallAt10: number;
  hitRate: number;
  ndcgAt10: number;
  evaluatedCaseCount: number;
  skippedCaseCount: number;
  durationMs: number;
  cases: RetrievalBenchmarkCaseResult[];
}

const discountedGain = (rank: number): number => 1 / Math.log2(rank + 1);

export const evaluateRetrievalCase = (
  benchmarkCase: RetrievalBenchmarkCase,
  retrievedDocumentIds: string[],
  latencyMs: number,
): RetrievalBenchmarkCaseResult => {
  const relevantIds = new Set(benchmarkCase.relevantDocumentIds);
  const top10 = retrievedDocumentIds.slice(0, 10);
  const firstRelevantIndex = top10.findIndex((documentId) => relevantIds.has(documentId));
  const relevantRetrievedAt10 = new Set(top10.filter((documentId) => relevantIds.has(documentId)))
    .size;
  const firstRelevantRank = firstRelevantIndex < 0 ? null : firstRelevantIndex + 1;
  const dcg = top10.reduce((total, documentId, index) => {
    return total + (relevantIds.has(documentId) ? discountedGain(index + 1) : 0);
  }, 0);
  const idealHitCount = Math.min(10, relevantIds.size);
  const idealDcg = Array.from({ length: idealHitCount }, (_, index) =>
    discountedGain(index + 1),
  ).reduce((total, gain) => total + gain, 0);
  return {
    id: benchmarkCase.id,
    datasetId: benchmarkCase.datasetId,
    query: benchmarkCase.query,
    relevantCount: relevantIds.size,
    relevantRetrievedAt10,
    firstRelevantRank,
    reciprocalRank: firstRelevantRank ? 1 / firstRelevantRank : 0,
    recallAt10: relevantIds.size ? relevantRetrievedAt10 / relevantIds.size : 0,
    hitAt10: firstRelevantRank !== null,
    ndcgAt10: idealDcg ? dcg / idealDcg : 0,
    latencyMs,
  };
};

export const summarizeRetrievalBenchmark = (
  cases: RetrievalBenchmarkCaseResult[],
  skippedCaseCount: number,
  durationMs: number,
): RetrievalBenchmarkReport => {
  const denominator = cases.length || 1;
  return {
    mrr: cases.reduce((total, item) => total + item.reciprocalRank, 0) / denominator,
    recallAt10: cases.reduce((total, item) => total + item.recallAt10, 0) / denominator,
    hitRate: cases.filter((item) => item.hitAt10).length / denominator,
    ndcgAt10: cases.reduce((total, item) => total + item.ndcgAt10, 0) / denominator,
    evaluatedCaseCount: cases.length,
    skippedCaseCount,
    durationMs,
    cases,
  };
};
