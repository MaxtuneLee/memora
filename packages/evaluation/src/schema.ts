import * as v from "valibot";

import type { EvaluationResult } from "./types";

const ModelRevisionSchema = v.variant("status", [
  v.object({ status: v.literal("known"), value: v.string() }),
  v.object({ status: v.literal("unknown") }),
]);

const ModelIdentitySchema = v.object({
  modelId: v.string(),
  modelRevision: ModelRevisionSchema,
  adapter: v.string(),
  runtime: v.string(),
  inference: v.record(v.string(), v.nullable(v.union([v.string(), v.number(), v.boolean()]))),
});

const DatasetSelectionSchema = v.object({
  datasetId: v.string(),
  revision: v.string(),
  configuration: v.string(),
  split: v.string(),
});

const MetricScoreSchema = v.object({
  insertions: v.number(),
  deletions: v.number(),
  substitutions: v.number(),
  edits: v.number(),
  referenceUnits: v.number(),
  value: v.nullable(v.number()),
  reason: v.optional(v.literal("zero-reference-units")),
});

const NormalizationProfileSchema = v.object({
  id: v.string(),
  version: v.number(),
  unicode: v.literal("NFC"),
  whitespace: v.literal("trim-and-collapse"),
  caseSensitive: v.literal(false),
  punctuation: v.literal("strip"),
});

const TextScoreSchema = v.object({
  profile: NormalizationProfileSchema,
  reference: v.object({ raw: v.string(), normalized: v.string() }),
  prediction: v.object({ raw: v.string(), normalized: v.string() }),
  wer: MetricScoreSchema,
  cer: MetricScoreSchema,
});

const ErrorDetailsSchema = v.object({ name: v.string(), message: v.string() });

const ExampleResultSchema = v.variant("status", [
  v.object({
    index: v.number(),
    sourceId: v.optional(v.union([v.string(), v.number()])),
    status: v.literal("succeeded"),
    reference: v.string(),
    prediction: v.string(),
    score: TextScoreSchema,
    modelCallMs: v.number(),
    modelCallTiming: v.literal("includes-queue-wait"),
  }),
  v.object({
    index: v.number(),
    sourceId: v.optional(v.union([v.string(), v.number()])),
    status: v.literal("failed"),
    reference: v.optional(v.string()),
    error: ErrorDetailsSchema,
  }),
]);

const EvaluationSummarySchema = v.object({
  total: v.number(),
  succeeded: v.number(),
  failed: v.number(),
  canceled: v.boolean(),
  wer: MetricScoreSchema,
  cer: MetricScoreSchema,
});

const EvaluationResultSchema = v.object({
  formatVersion: v.literal(1),
  runId: v.string(),
  dataset: DatasetSelectionSchema,
  model: ModelIdentitySchema,
  config: v.object({ referenceField: v.string(), audioField: v.string() }),
  status: v.picklist(["completed", "canceled", "failed"]),
  startedAt: v.string(),
  finishedAt: v.string(),
  modelInitializationMs: v.number(),
  examples: v.array(ExampleResultSchema),
  summary: EvaluationSummarySchema,
  error: v.optional(ErrorDetailsSchema),
});

export function parseEvaluationResult(input: unknown): EvaluationResult {
  return v.parse(EvaluationResultSchema, input) as EvaluationResult;
}
