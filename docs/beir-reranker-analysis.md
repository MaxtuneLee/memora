# BEIR reranker analysis

Whether a cross-encoder reranker on top of Memora's hybrid search improves retrieval, measured on BEIR subsets in the browser. Short answer: not in this setup. The reranker works as intended, but its idea of relevance does not match these datasets', and the hybrid first stage already ranks the relevant document first for most SciFact queries.

The runs were made on 2026-10-06 and 2026-10-07 with the playground's BEIR pages (`packages/web/beir-dissertation.html`, `packages/web/beir-reranker.html`, code in `packages/web/src/lib/playground/beirRerankerEvaluation.js`). Results are in `~/memora-eval-data/results/` (`beir-dissertation-bge-small-en-cls-k20.json`, `beir-reranker-base-fp32-webgpu-bge-small-en-cls-k20-c50-v1.json`). The reranker code has changed since (commit 2906437); these numbers come from the version that produced the files.

## Setup

- **First stage**: Memora's search over one index per dataset. Dense: `Xenova/bge-small-en-v1.5`, q8, CLS pooling, normalized, with the BGE query instruction. Lexical: BM25. Hybrid: reciprocal rank fusion of both (k = 60, candidate pool 505). One chunk per document (title, space, text); a query's own ID is excluded.
- **Reranker**: `Xenova/bge-reranker-base`, fp32, WebGPU, max length 512 with `longest_first` truncation. Each (query, document) pair is scored as a raw single-label logit and the candidates are sorted by it, highest first. The query is the raw query text, without the BGE instruction.
- **Metric**: nDCG@10 with graded relevance (linear gain), over every query in the dataset's test split.

## First-stage results

nDCG@10, complete runs:

| Dataset  | Queries | BM25  | Dense     | Hybrid    |
| -------- | ------- | ----- | --------- | --------- |
| SciFact  | 300     | 0.682 | 0.715     | **0.735** |
| NFCorpus | 323     | 0.324 | 0.343     | **0.366** |
| ArguAna  | 1406    | 0.485 | **0.596** | 0.581     |

Hybrid is best on two of three. On ArguAna dense is best, and BM25 is slow there (median 179 ms per query against 29 ms for dense) most likely because its queries are whole arguments, so every query matches many terms.

## Reranker results

Reranking the hybrid top 50:

| Dataset  | Hybrid | Hybrid + reranker | Candidate recall@50 |
| -------- | ------ | ----------------- | ------------------- |
| SciFact  | 0.738  | 0.719             | 0.95                |
| NFCorpus | 0.365  | 0.325             | 0.26                |

ArguAna was canceled after 45 of 1406 queries. Scoring took a median of about 7.6 s per query (50 pairs). Two top-100 runs did not finish: one stopped on "Prior candidate fingerprint differs", the other was canceled after 4 queries.

## Why it gets worse

The per-query data rules out an implementation fault:

- Every one of the 623 queries is ranked strictly by logit, highest first.
- The reranker does separate relevant from irrelevant documents: on SciFact the mean logit is +0.31 for relevant candidates and −5.91 for the rest.
- Pairs are passed as `(query, text_pair: document)` and the query carries no embedding instruction.

The losses come from the method in this setting:

1. **The first stage is already right at the top.** On SciFact the median rank of a relevant document in the hybrid candidates is 1. Of 300 queries, 192 are unchanged, 42 improve and 66 get worse: with the answer already first, a reordering can mostly only move it down. SciFact queries are scientific claims ("0-dimensional biomaterials show inductive properties."), and a document is relevant when it supports or refutes the claim; the reranker, trained on question-passage relevance, tends to lift abstracts on the same topic that do not address the claim.
2. **NFCorpus grades relevance differently from the reranker.** Its labels come from citation links in NutritionFacts articles (2 for a direct link, 1 for an indirect one), not from whether a passage answers the query. The reranker scores the most relevant grade below the middle one:

   | Grade | Candidates | Mean logit |
   | ----- | ---------- | ---------- |
   | 0     | 14,183     | −5.79      |
   | 1     | 1,648      | −1.92      |
   | 2     | 319        | −2.68      |

   The median rank of a relevant candidate moves from 13 to 16; 124 queries get worse and 80 better.

3. **NFCorpus leaves little to rerank.** Candidate recall at 50 is 0.26: most relevant documents never reach the reranker.

## Other ways to use the scores

Computed offline from the same scores, nDCG@10:

| Ordering                                     | SciFact   | NFCorpus  |
| -------------------------------------------- | --------- | --------- |
| Hybrid                                       | 0.738     | **0.365** |
| Reranker over the top 50                     | 0.719     | 0.325     |
| Reranker over the top 10 only                | 0.737     | 0.357     |
| Reranker over the top 20 only                | 0.725     | 0.341     |
| RRF of the hybrid rank and the reranker rank | **0.748** | 0.355     |

Fusing the two rankings instead of replacing one with the other gains a point on SciFact and still loses one on NFCorpus. Reranking only the top 10 loses least but gains nothing.

## Conclusion

With bge-small hybrid retrieval as the first stage, bge-reranker-base gives no reliable improvement and costs several seconds per query on the device. If reranking is tried again, the two directions worth testing are fusing its rank with the hybrid rank, and a reranker whose training matches the task (for example bge-reranker-v2-m3, which the code also supports); either is likely to move nDCG@10 by about a point at most.
