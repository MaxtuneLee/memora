export interface RerankerScore {
  documentId: string;
  logit?: number;
  relevanceProbability?: number;
}

export function rerankCandidateIds(
  ids: readonly string[],
  scores: readonly RerankerScore[],
): string[] {
  if (ids.length !== scores.length || new Set(ids).size !== ids.length)
    throw new Error("Candidate/score counts differ or IDs are duplicated.");
  const values = new Map(scores.map((s) => [s.documentId, s.relevanceProbability ?? s.logit]));
  if (values.size !== ids.length || ids.some((id) => !Number.isFinite(values.get(id))))
    throw new Error("Missing, duplicated or non-finite reranker scores.");
  return ids
    .map((id, index) => ({ id, index, score: values.get(id) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((v) => v.id);
}

export function scoreBeirRanking(
  ids: readonly string[],
  relevance: Readonly<Record<string, number>>,
  cutoff: number,
): { ndcg: number; recall: number } {
  if (!Number.isInteger(cutoff) || cutoff < 1 || new Set(ids).size !== ids.length)
    throw new Error("Invalid ranking or cutoff.");
  const positive = Object.values(relevance)
    .filter((g) => g > 0)
    .sort((a, b) => b - a);
  if (!positive.length || Object.values(relevance).some((g) => !Number.isFinite(g) || g < 0))
    throw new Error("Invalid relevance grades.");
  const top = ids.slice(0, cutoff);
  const dcg = top.reduce((sum, id, i) => sum + (relevance[id] ?? 0) / Math.log2(i + 2), 0);
  const ideal = positive
    .slice(0, cutoff)
    .reduce((sum, grade, i) => sum + grade / Math.log2(i + 2), 0);
  return {
    ndcg: dcg / ideal,
    recall: top.filter((id) => (relevance[id] ?? 0) > 0).length / positive.length,
  };
}
