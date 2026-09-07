import type { MediaReference } from "@memora/datasets";

import { scoreText } from "./metrics";
import type {
  EditCounts,
  EvaluationExampleResult,
  EvaluationResult,
  MetricScore,
  RunEvaluationOptions,
} from "./types";
import { decodeWav } from "./wav";

const errorDetails = (error: unknown) => ({
  name: error instanceof Error ? error.name : "Error",
  message: error instanceof Error ? error.message : String(error),
});

const aggregate = (results: EvaluationExampleResult[], metric: "wer" | "cer"): MetricScore => {
  const counts: EditCounts = { insertions: 0, deletions: 0, substitutions: 0 };
  let referenceUnits = 0;
  for (const result of results) {
    if (result.status !== "succeeded") continue;
    const score = result.score[metric];
    counts.insertions += score.insertions;
    counts.deletions += score.deletions;
    counts.substitutions += score.substitutions;
    referenceUnits += score.referenceUnits;
  }
  const edits = counts.insertions + counts.deletions + counts.substitutions;
  return {
    ...counts,
    edits,
    referenceUnits,
    value: referenceUnits === 0 ? null : edits / referenceUnits,
    ...(referenceUnits === 0 ? { reason: "zero-reference-units" as const } : {}),
  };
};

export async function runEvaluation(options: RunEvaluationOptions): Promise<EvaluationResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const referenceField = options.referenceField ?? "transcription";
  const audioField = options.audioField ?? "audio";
  const results: EvaluationExampleResult[] = [];
  const base = {
    formatVersion: 1 as const,
    runId: options.createId?.() ?? crypto.randomUUID(),
    dataset: options.dataset.selection,
    model: options.model.identity,
    config: { referenceField, audioField },
    startedAt: startedAt.toISOString(),
  };
  const initializationStarted = performance.now();
  try {
    options.signal?.throwIfAborted();
    await options.model.initialize?.(options.signal);
  } catch (error) {
    const finishedAt = now();
    return {
      ...base,
      status: options.signal?.aborted ? "canceled" : "failed",
      finishedAt: finishedAt.toISOString(),
      modelInitializationMs: performance.now() - initializationStarted,
      examples: [],
      summary: {
        total: options.dataset.length ?? 0,
        succeeded: 0,
        failed: 0,
        canceled: options.signal?.aborted ?? false,
        wer: aggregate([], "wer"),
        cer: aggregate([], "cer"),
      },
      error: errorDetails(error),
    };
  }
  const modelInitializationMs = performance.now() - initializationStarted;
  let index = 0;
  try {
    for await (const example of options.dataset) {
      if (options.signal?.aborted) break;
      const sourceId =
        typeof example.id === "string" || typeof example.id === "number" ? example.id : undefined;
      const reference = example[referenceField];
      try {
        if (typeof reference !== "string")
          throw new Error(`Example ${index} has no ${referenceField} text.`);
        const media = example[audioField];
        if (!media || typeof media !== "object" || !("type" in media) || media.type !== "media") {
          throw new Error(`Example ${index} has no ${audioField} media reference.`);
        }
        const encoded = await options.dataset.readMedia(media as MediaReference);
        const decoded = decodeWav(encoded.bytes);
        const callStarted = performance.now();
        const prediction = await options.model.predict({ ...decoded, example }, options.signal);
        if (options.signal?.aborted) break;
        results.push({
          index,
          sourceId,
          status: "succeeded",
          reference,
          prediction,
          score: scoreText(reference, prediction),
          modelCallMs: performance.now() - callStarted,
          modelCallTiming: "includes-queue-wait",
        });
      } catch (error) {
        if (options.signal?.aborted) break;
        results.push({
          index,
          sourceId,
          status: "failed",
          ...(typeof reference === "string" ? { reference } : {}),
          error: errorDetails(error),
        });
      }
      index += 1;
      options.onProgress?.({
        completed: results.length,
        total: options.dataset.length ?? results.length,
        result: results.at(-1),
      });
    }
  } catch (error) {
    const finishedAt = now();
    return {
      ...base,
      status: "failed",
      finishedAt: finishedAt.toISOString(),
      modelInitializationMs,
      examples: results,
      summary: {
        total: options.dataset.length ?? results.length,
        succeeded: results.filter((result) => result.status === "succeeded").length,
        failed: results.filter((result) => result.status === "failed").length,
        canceled: false,
        wer: aggregate(results, "wer"),
        cer: aggregate(results, "cer"),
      },
      error: errorDetails(error),
    };
  }
  const canceled = options.signal?.aborted ?? false;
  return {
    ...base,
    status: canceled ? "canceled" : "completed",
    finishedAt: now().toISOString(),
    modelInitializationMs,
    examples: results,
    summary: {
      total: options.dataset.length ?? results.length,
      succeeded: results.filter((result) => result.status === "succeeded").length,
      failed: results.filter((result) => result.status === "failed").length,
      canceled,
      wer: aggregate(results, "wer"),
      cer: aggregate(results, "cer"),
    },
  };
}
