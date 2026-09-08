import type { Dataset, DatasetExample, DatasetSelection } from "@memora/datasets";

export interface ModelIdentity {
  modelId: string;
  modelRevision: { status: "known"; value: string } | { status: "unknown" };
  adapter: string;
  runtime: string;
  inference: Record<string, string | number | boolean | null>;
}

export interface ModelInput {
  pcm: Float32Array;
  sampleRate: number;
  example: DatasetExample;
}

export interface ModelAdapter {
  identity: ModelIdentity;
  initialize?: (signal?: AbortSignal) => Promise<void>;
  predict: (input: ModelInput, signal?: AbortSignal) => Promise<string>;
}

export interface NormalizationProfile {
  id: string;
  version: number;
  unicode: "NFC";
  whitespace: "trim-and-collapse";
  caseSensitive: false;
  punctuation: "strip";
}

export interface EditCounts {
  insertions: number;
  deletions: number;
  substitutions: number;
}

export interface MetricScore extends EditCounts {
  edits: number;
  referenceUnits: number;
  value: number | null;
  reason?: "zero-reference-units";
}

export interface TextScore {
  profile: NormalizationProfile;
  reference: { raw: string; normalized: string };
  prediction: { raw: string; normalized: string };
  wer: MetricScore;
  cer: MetricScore;
}

export type EvaluationExampleResult =
  | {
      index: number;
      sourceId?: string | number;
      status: "succeeded";
      reference: string;
      prediction: string;
      score: TextScore;
      modelCallMs: number;
      modelCallTiming: "includes-queue-wait";
    }
  | {
      index: number;
      sourceId?: string | number;
      status: "failed";
      reference?: string;
      error: { name: string; message: string };
    };

export interface EvaluationSummary {
  total: number;
  succeeded: number;
  failed: number;
  canceled: boolean;
  wer: MetricScore;
  cer: MetricScore;
}

export interface EvaluationResult {
  formatVersion: 1;
  runId: string;
  dataset: DatasetSelection;
  model: ModelIdentity;
  config: { referenceField: string; audioField: string };
  status: "completed" | "canceled" | "failed";
  startedAt: string;
  finishedAt: string;
  modelInitializationMs: number;
  examples: EvaluationExampleResult[];
  summary: EvaluationSummary;
  error?: { name: string; message: string };
}

export interface EvaluationProgress {
  completed: number;
  total: number;
  result?: EvaluationExampleResult;
}

export interface RunEvaluationOptions {
  dataset: Dataset;
  model: ModelAdapter;
  referenceField?: string;
  audioField?: string;
  signal?: AbortSignal;
  onProgress?: (progress: EvaluationProgress) => void;
  now?: () => Date;
  createId?: () => string;
}
