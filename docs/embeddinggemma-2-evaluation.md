# EmbeddingGemma 2 evaluation

Whether `onnx-community/embeddinggemma-2-ONNX` should replace BGE-M3 as Memora's local embedding model, measured on BEIR subsets in the browser. Short answer: yes. It is better than BGE-M3 on all three datasets, downloads about half as much, and indexes documents faster. It also embeds images into the same space as text, which BGE cannot do.

The run was made on 2026-10-14 with the playground's BEIR page (`packages/web/beir-dissertation.html?model=embeddinggemma-2`), the same harness that produced the earlier BGE results. Results are in `~/memora-eval-data/results/beir-dissertation-embeddinggemma-2-q4-v1.json`.

## Setup

- **Model**: EmbeddingGemma 2 with the text and image encoders (440M parameters; the audio encoder is removed from the config before loading, so it is never downloaded). q4 weights: 174 MB for the text model, 109 MB for the vision encoder and a 32 MB tokenizer. WebGPU, 768 dimensions, mean pooling inside the model graph, normalized. Inputs are truncated at the model context (8,192 tokens), as BGE's pipeline is.
- **Prefixes**: queries `task: search result | query: `, documents `title: none | text: ` before the harness's usual document text.
- **Harness**: one chunk per document (title, space, text), BM25 and dense in separate indexes, hybrid by reciprocal rank fusion (k = 60). A query's own ID is excluded. 4 embedding workers, 16 documents per batch, 4 concurrent queries.
- **Metric**: nDCG@10 with graded relevance (linear gain), over every query in the test split.
- **Requires** `@huggingface/transformers` 4.3.1 or later; 4.2.0 does not know the `embedding_gemma2` architecture.

## Results

nDCG@10:

| Dataset  | Queries | BM25  | BGE-M3 dense | BGE small dense | Gemma dense | Gemma hybrid |
| -------- | ------- | ----- | ------------ | --------------- | ----------- | ------------ |
| SciFact  | 300     | 0.682 | 0.641        | 0.715           | **0.848**   | 0.788        |
| NFCorpus | 323     | 0.324 | 0.312        | 0.343           | 0.355       | **0.373**    |
| ArguAna  | 1406    | 0.485 | 0.538        | 0.596           | **0.633**   | 0.595        |

BGE-M3 comes from `beir-dissertation-v1.json`, which was produced by harness version 10. Gemma and BGE small (`beir-dissertation-bge-small-en-cls-v1.json`) both come from version 12. BM25 scores are 0.011 to 0.016 higher in version 12 than in version 10, so part of the gap to BGE-M3 is the harness. The gap to BGE small, measured with the same harness, is still 0.01 to 0.13.

The SciFact score is higher than published results for much larger models (about 0.75 to 0.80). The model may have seen SciFact training data. Read that number as an upper bound, not as a measure of general quality.

Hybrid is worse than dense alone on SciFact and ArguAna at equal weights.

## Hybrid weight

Hybrid search adds `1 / (60 + BM25 rank)` and `r / (60 + dense rank)`, where r is the weight of the semantic list relative to BM25. Both Memora's search and the harness use r = 1. To check it for Gemma, NFCorpus was run once more with 55 results per method (`?model=embeddinggemma-2&datasets=nfcorpus&queries=1&k=55`, report `beir-dissertation-embeddinggemma-2-q4-nfcorpus-k55.json`), and the fusion was recomputed offline from those lists for each r. At r = 1 the offline score is 0.3734, against 0.3733 from the page.

| r       | 0 (BM25) | 0.25  | 0.5   | 0.99 (best) | 1     | 2     | 4     | 8     | ∞ (dense) |
| ------- | -------- | ----- | ----- | ----------- | ----- | ----- | ----- | ----- | --------- |
| nDCG@10 | 0.336    | 0.361 | 0.366 | **0.375**   | 0.373 | 0.369 | 0.370 | 0.369 | 0.355     |

At r = 0 the score is above BM25's 0.324 because BM25 finds fewer than 10 passages for some queries and the dense list fills the rest. The curve is not unimodal: a narrow peak at r = 1 and a lower plateau from r = 2 to 8, so a plain ternary search over the whole range lands on the plateau. Searching around the main peak puts the best weight at 0.99, which is 0.001 above r = 1 and within the noise of 323 queries. Memora keeps equal weights. This was measured on NFCorpus only, where hybrid already beats dense; SciFact and ArguAna, where dense alone is better at r = 1, were not tuned.

## Speed

| Measure                | Gemma 2 q4                             | BGE-M3 q8      |
| ---------------------- | -------------------------------------- | -------------- |
| Download               | about 315 MB (text, vision, tokenizer) | 569 MB         |
| Documents per second   | 5.6 (SciFact, NFCorpus), 7.8 (ArguAna) | about 4        |
| Query encoding, median | 106 ms (SciFact), 263 ms (ArguAna)     | not comparable |

Both use 4 workers and whole BEIR documents, which are much longer than the 256-token chunks the app indexes. The BGE-M3 report has no usable throughput figure, because its wall time includes the pauses between resumed runs; the figure above is a separate observation. Its query times were also measured under a different concurrency.

## Decision

- Use EmbeddingGemma 2 (text and image, q4) as the default local embedding model.
- Keep OCR for images. Index an image file as its OCR text chunks plus one embedding of the whole image, so text queries can find a picture by what it shows as well as by the words in it.
- Keep equal weights for BM25 and semantic results in hybrid search.
