import type { EvaluationResult } from "../src/types";

export function sampleEvaluationResult(
  overrides: Partial<EvaluationResult> = {},
): EvaluationResult {
  return {
    formatVersion: 1,
    runId: "run-1",
    dataset: {
      datasetId: "google/fleurs",
      revision: "70bb2e84b976b7e960aa89f1c648e09c59f894dd",
      configuration: "hi_in",
      split: "test",
    },
    model: {
      modelId: "whisper-base-timestamped",
      modelRevision: { status: "unknown" },
      adapter: "whisper",
      runtime: "transformers-js",
      inference: { language: "hi" },
    },
    config: { referenceField: "transcription", audioField: "audio" },
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    modelInitializationMs: 120,
    examples: [
      {
        index: 0,
        sourceId: 1,
        status: "succeeded",
        reference: "hello world",
        prediction: "hello world",
        score: {
          profile: {
            id: "memora-text-default",
            version: 1,
            unicode: "NFC",
            whitespace: "trim-and-collapse",
            caseSensitive: false,
            punctuation: "strip",
          },
          reference: { raw: "hello world", normalized: "hello world" },
          prediction: { raw: "hello world", normalized: "hello world" },
          wer: {
            insertions: 0,
            deletions: 0,
            substitutions: 0,
            edits: 0,
            referenceUnits: 2,
            value: 0,
          },
          cer: {
            insertions: 0,
            deletions: 0,
            substitutions: 0,
            edits: 0,
            referenceUnits: 10,
            value: 0,
          },
        },
        modelCallMs: 42,
        modelCallTiming: "includes-queue-wait",
      },
    ],
    summary: {
      total: 1,
      succeeded: 1,
      failed: 0,
      canceled: false,
      wer: { insertions: 0, deletions: 0, substitutions: 0, edits: 0, referenceUnits: 2, value: 0 },
      cer: {
        insertions: 0,
        deletions: 0,
        substitutions: 0,
        edits: 0,
        referenceUnits: 10,
        value: 0,
      },
    },
    ...overrides,
  };
}
