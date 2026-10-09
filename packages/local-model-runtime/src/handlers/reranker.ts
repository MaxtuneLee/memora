import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
  type ProgressInfo,
} from "@huggingface/transformers";

import { configureTransformersCache } from "../cache";

import { BEIR_RERANKER, getBeirRerankerProfile, type BeirRerankerProfile } from "../rerankerConfig";
import type { LocalModelEvent, LocalModelExecutionBackend, LocalModelTask } from "../types";

export async function loadBeirReranker(
  onProgress: (progress: ProgressInfo) => void,
  device: LocalModelExecutionBackend = BEIR_RERANKER.device,
  profile: BeirRerankerProfile = "m3",
) {
  const config = getBeirRerankerProfile(profile);
  if (profile === "base" && device !== "webgpu")
    throw new Error("The base model requires WebGPU; no silent WASM fallback.");
  env.allowLocalModels = false;
  configureTransformersCache(env);
  const tokenizer = await AutoTokenizer.from_pretrained(config.modelId, {
    revision: config.revision,
    progress_callback: onProgress,
  });
  const model = await AutoModelForSequenceClassification.from_pretrained(config.modelId, {
    revision: config.revision,
    dtype: config.dtype,
    device,
    // A successful probe must not silently execute unsupported matrix operators on CPU.
    session_options:
      device === "webgpu" && profile === "m3"
        ? { extra: { session: { disable_cpu_ep_fallback: "1" } } }
        : {},
    progress_callback: onProgress,
  });
  return {
    async score(query: string, document: string): Promise<{ logit: number; scoringMs: number }> {
      const started = performance.now();
      // One label: softmax would return 1 for every pair and destroy the ranking.
      const inputs = tokenizer(query, {
        text_pair: document,
        padding: true,
        truncation: true,
        max_length: config.maxLength,
      });
      const { logits } = await model(inputs);
      if (logits.data.length !== 1 || !Number.isFinite(Number(logits.data[0]))) {
        throw new Error("Reranker returned an invalid single-label logit.");
      }
      return { logit: Number(logits.data[0]), scoringMs: performance.now() - started };
    },
    async dispose(): Promise<void> {
      await model.dispose();
    },
  };
}

const rerankers = new Map<string, Promise<Awaited<ReturnType<typeof loadBeirReranker>>>>();

export async function runRerankerTask(
  task: Extract<LocalModelTask, { kind: "reranker.score" }>,
  emit: (event: LocalModelEvent) => void,
  canceled: () => boolean,
): Promise<void> {
  const { device, query, document, profile = "m3" } = task.input;
  const key = profile + ":" + device;
  if (canceled()) return;
  if (!rerankers.has(key)) {
    emit({ type: "status", status: "loading-model" });
    const loading = loadBeirReranker(
      (progress) => {
        if (canceled()) return;
        emit({
          type: "model-progress",
          file: "file" in progress ? progress.file : progress.status,
          progress: "progress" in progress ? progress.progress / 100 : undefined,
        });
      },
      device,
      profile,
    ).catch((error) => {
      rerankers.delete(key);
      throw error;
    });
    rerankers.set(key, loading);
  }
  const scorer = await rerankers.get(key);
  if (!scorer || canceled()) return;
  emit({ type: "backend", backend: device });
  emit({ type: "status", status: "running" });
  const result = await scorer.score(query, document);
  if (!canceled()) emit({ type: "reranker-complete", ...result, backend: device });
}
