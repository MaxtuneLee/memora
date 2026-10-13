# @memora/evaluation

`@memora/evaluation` runs a model-independent evaluation over an installed `@memora/datasets` split. It currently includes a strict mono 16 kHz PCM WAV decoder and versioned WER/CER metrics for browser ASR evaluation.

## Model adapter

The adapter is the only model-specific boundary. Its identity is copied into the result, including an explicit unknown revision when the runtime cannot report one.

```ts
import type { ModelAdapter } from "@memora/evaluation";

const model: ModelAdapter = {
  identity: {
    modelId: "whisper-base-timestamped",
    modelRevision: { status: "unknown" },
    adapter: "whisper",
    runtime: "transformers-js",
    inference: { language: "hi", priority: "background" },
  },
  async initialize(signal) {
    await preloadModel(signal);
  },
  async predict({ pcm, sampleRate }, signal) {
    return transcribe({ pcm, sampleRate, signal });
  },
};
```

## Run and cancel

```ts
import { runEvaluation } from "@memora/evaluation";
import { openDataset } from "@memora/datasets";

const controller = new AbortController();
const dataset = await openDataset({
  datasetId: "google/fleurs",
  revision: "70bb2e84b976b7e960aa89f1c648e09c59f894dd",
  configuration: "hi_in",
  split: "test",
});

const result = await runEvaluation({
  dataset,
  model,
  signal: controller.signal,
  onProgress: ({ completed, total, result: example }) => {
    console.log(completed, total, example);
  },
});

// Canceling stops new examples and ignores a prediction that arrives after cancellation.
controller.abort();
dataset.close();
```

The returned object is complete in memory and has `completed`, `canceled`, or `failed` status. A media or inference failure is stored on that example and the run continues. Model initialization and dataset-wide failures end the run. Each successful example stores raw and normalized text, WER/CER edit counts, and model-call duration including queue wait.

The default normalization profile is `memora-text-default` version 1: NFC, lowercased, punctuation stripped, trimmed and collapsed whitespace. Case and punctuation are not scored — a reference and prediction that differ only in casing or punctuation report zero edits, since ASR references (e.g. FLEURS) are typically unpunctuated and lowercase while model output naturally isn't. WER uses whitespace-delimited words. CER uses Unicode code points and excludes whitespace. Aggregate rates use total edits divided by total successful reference units; failed examples do not enter the denominator. A zero denominator returns `null` with `zero-reference-units`.

## Save and reopen results

```ts
import {
  listEvaluationResults,
  readEvaluationResult,
  saveEvaluationResult,
} from "@memora/evaluation";

await saveEvaluationResult(result);

// After a page reload, with no in-memory reference to `result`:
const summaries = await listEvaluationResults();
const reopened = await readEvaluationResult(summaries[0].runId);
```

Each run is saved as a single JSON document in OPFS, keyed by `runId`. `saveEvaluationResult` rejects with an `EvaluationError` coded `save-failed` rather than silently succeeding when the write fails — callers must not report a failed save as saved. `listEvaluationResults` returns lightweight summaries (dataset, model, status, timestamps, and the aggregate `summary`, without the full per-example `examples` array) sorted newest first, and silently skips any file that fails to parse or validate so one corrupted result does not make the whole list unavailable. `readEvaluationResult` validates the full document and rejects with `not-found` or `invalid-result` for a run that was never saved or whose file is corrupted.

The ASR and agent runners currently save a complete or partial result after their promise resolves; they do not automatically reopen it after a page closes. The Web playground owns Worker bridging. For item-by-item continuation, use the shared resumable runner below.

## Agent evaluation

`runAgentEvaluation` runs each `EvaluationQuestion` three times against an `AgentAdapter`, up to `concurrency` attempts at once (3 by default). The agent sees only the question text. Each attempt is scored by `scoreCitations`, a pure function versioned by `AGENT_SCORER_VERSION`: a citation hits an evidence group when its file maps to the group's lecture and it lands within 5 s of one of the group's alternative windows. Answer coverage comes from the `JudgeAdapter`, which receives the text of the cited cues. An attempt passes when retrieval passes, every required point is supported, and no disallowed or unsupported claim appears.

Agent errors, judge errors, and timeouts (`attemptTimeoutMs`, 5 minutes by default) are failed attempts that stay in the result. Aborting the signal stops new attempts, aborts in-flight ones, and returns a `canceled` result without them. Save with `saveAgentEvaluationResult`; results live under `/memora/agent-evaluations/`, apart from ASR results.

## Resume individual evaluation items

`runResumableEvaluation` is a model-independent runner with bounded concurrency (1 by default). Call it with a stable `checkpointPath`, a fingerprint of the dataset and evaluation settings, the ordered items and their IDs, and an `evaluate` callback. It uses the same `ResultStorage` interface as other evaluation results and defaults to OPFS; a caller can supply local-file storage instead.

Set `concurrency` to run multiple evaluations at once. Results and checkpoint writes keep their original item order, so concurrent adapters must safely handle independent requests. Each completed item is saved separately before the manifest cursor advances. Reopening the same run reads its saved items and starts at the first missing item. It also recovers an item whose write succeeded just before its cursor update was interrupted. Changed item order or fingerprints, missing committed items, and storage failures reject the run. A `validateResult` callback can verify saved metrics before they are reused. `initialResults` migrates an older in-memory or JSON checkpoint into the journal.

```ts
import { runResumableEvaluation } from "@memora/evaluation";

const results = await runResumableEvaluation({
  checkpointPath: "/memora/evaluations/retrieval-run/scifact/dense",
  fingerprint: datasetAndModelFingerprint,
  items: queries,
  itemId: (query) => query.id,
  evaluate: (query, _index, signal) => retrieveAndScore(query, signal),
  signal: controller.signal,
  onProgress: ({ completed, total, resumed }) => {
    console.log(`${completed}/${total}; ${resumed} items restored`);
  },
});
```

An interrupted item that has not yet reached storage may run again, including a later item that finished while an earlier item was still running; durably saved items are retained with their original scores and timing.


### Jev BEIR reranking

The existing BEIR comparison page supports `?reranker=1&model=jev&k=20&candidates=100&trial=1` for the first three SciFact queries. Remove `trial=1` for all three datasets. It uses the existing saved indexes, query vectors and authenticated Jev transport, with separate `beir-reranker-jev` reports/checkpoints. Each candidate document and final query are saved with `runResumableEvaluation`; no original BGE or @10/@20 report is overwritten.

`createJevReranker` pins `jev-1.13.0`, returns the raw `answers.relevance.noul` probability and validates the returned model and token usage. It ranks raw probabilities descending with stable candidate-order ties. The relevance prompt describes scientific evidence supporting/refuting a claim, medical information needs or counterarguments, according to the dataset. It never sends qrels or retrieval ranks. Query and full saved title/text go to TypeSafe; BGE's 512-token policy therefore differs.

The page supports 1/2/4 concurrent API requests, actual reply logs and per-document resume. It uses `/api/playground/typesafe` and a saved TypeSafe credential or password input; credentials are never included in reports. HTTP timings include network/retries. Cumulative response work and parallel query wall time with checkpoint I/O are reported separately; API smoke checks and cached-vector retrieval are separate. Token cost is a dated estimate, not an invoice.
