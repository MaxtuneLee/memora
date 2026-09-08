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

The default normalization profile is `memora-text-default` version 1: NFC, trimmed and collapsed whitespace, with case and punctuation preserved. WER uses whitespace-delimited words. CER uses Unicode code points and excludes whitespace. Aggregate rates use total edits divided by total successful reference units; failed examples do not enter the denominator. A zero denominator returns `null` with `zero-reference-units`.

## Save and reopen results

```ts
import { listEvaluationResults, readEvaluationResult, saveEvaluationResult } from "@memora/evaluation";

await saveEvaluationResult(result);

// After a page reload, with no in-memory reference to `result`:
const summaries = await listEvaluationResults();
const reopened = await readEvaluationResult(summaries[0].runId);
```

Each run is saved as a single JSON document in OPFS, keyed by `runId`. `saveEvaluationResult` rejects with an `EvaluationError` coded `save-failed` rather than silently succeeding when the write fails — callers must not report a failed save as saved. `listEvaluationResults` returns lightweight summaries (dataset, model, status, timestamps, and the aggregate `summary`, without the full per-example `examples` array) sorted newest first, and silently skips any file that fails to parse or validate so one corrupted result does not make the whole list unavailable. `readEvaluationResult` validates the full document and rejects with `not-found` or `invalid-result` for a run that was never saved or whose file is corrupted.

The package does not resume a run after a page closes, and storage is a single flat JSON document per run — no chunking, IndexedDB, or cross-run analysis. The Web playground owns Worker bridging and triggers the save once a run's promise resolves.
