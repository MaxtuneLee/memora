import * as ort from "onnxruntime-web/webgpu";

import {
  clearTransformersModelCache,
  getLocalModelAssetCache,
  isTransformersModelCacheCorruptionError,
} from "../../../cache";
import type { LocalAsrEvent } from "../../../types";

const MODEL_ID = "onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4";

/**
 * "main" is a mutable branch pointer; resolving it once per load and reusing
 * the returned SHA for every file keeps a single load internally consistent
 * and gives cached assets a revision-scoped cache key.
 */
const resolveModelRevision = async (): Promise<string> => {
  const response = await fetch(`https://huggingface.co/api/models/${MODEL_ID}/revision/main`);
  if (!response.ok)
    throw new Error(`Nemotron model revision lookup failed: HTTP ${response.status}.`);
  const info = (await response.json()) as { sha?: string };
  if (!info.sha)
    throw new Error("The Hub did not return an immutable revision for the Nemotron model.");
  return info.sha;
};

export interface NemotronSessions {
  encoder: ort.InferenceSession;
  decoder: ort.InferenceSession;
  joint: ort.InferenceSession;
  vocabulary: string[];
  revision: string;
}

const readModelAsset = async (
  modelUrl: string,
  file: string,
  emit: (event: LocalAsrEvent) => void,
): Promise<ArrayBuffer> => {
  const request = `${modelUrl}/${file}`;
  const cache = getLocalModelAssetCache();
  const cached = await cache.match(request);
  if (cached) return cached.arrayBuffer();

  const response = await fetch(request);
  if (!response.ok)
    throw new Error(`Nemotron model download failed for ${file}: HTTP ${response.status}.`);
  await cache.put(request, response.clone());
  emit({ type: "model-progress", file, progress: 100 });
  return response.arrayBuffer();
};

const createOnnxSession = async (
  modelUrl: string,
  modelFile: string,
  dataFile: string,
  executionProviders: string[],
  emit: (event: LocalAsrEvent) => void,
): Promise<ort.InferenceSession> => {
  const [model, data] = await Promise.all([
    readModelAsset(modelUrl, modelFile, emit),
    readModelAsset(modelUrl, dataFile, emit),
  ]);
  return ort.InferenceSession.create(model, {
    executionProviders,
    externalData: [{ path: dataFile, data }],
  });
};

const createNemotronSessions = async (
  emit: (event: LocalAsrEvent) => void,
): Promise<NemotronSessions> => {
  const revision = await resolveModelRevision();
  const modelUrl = `https://huggingface.co/${MODEL_ID}/resolve/${revision}`;
  // ponytail: sequential per-session load+create so only one model's
  // onnx+external-data buffers (not all three) peak in memory at once.
  const encoderSession = await createOnnxSession(
    modelUrl,
    "encoder.onnx",
    "encoder.onnx.data",
    ["webgpu", "wasm"],
    emit,
  );
  const decoderSession = await createOnnxSession(
    modelUrl,
    "decoder.onnx",
    "decoder.onnx.data",
    ["wasm"],
    emit,
  );
  const jointSession = await createOnnxSession(
    modelUrl,
    "joint.onnx",
    "joint.onnx.data",
    ["wasm"],
    emit,
  );
  const vocabulary = await readModelAsset(modelUrl, "vocab.txt", emit);
  return {
    encoder: encoderSession,
    decoder: decoderSession,
    joint: jointSession,
    vocabulary: new TextDecoder().decode(vocabulary).split(/\r?\n/),
    revision,
  };
};

let sessionsPromise: Promise<NemotronSessions> | undefined;
let cacheRecoveryAttempted = false;

/**
 * Keeps the ONNX sessions alive for the lifetime of the ASR shared worker.
 * Session creation initializes the WebGPU encoder, so recreating it for every
 * task would repeatedly upload the model and discard its compiled graph.
 */
export const loadNemotronSessions = async (
  emit: (event: LocalAsrEvent) => void,
): Promise<NemotronSessions> => {
  emit({ type: "status", status: "loading-model" });
  sessionsPromise ??= createNemotronSessions(emit).catch(async (error: unknown) => {
    sessionsPromise = undefined;
    if (!cacheRecoveryAttempted && isTransformersModelCacheCorruptionError(error)) {
      cacheRecoveryAttempted = true;
      await clearTransformersModelCache({ modelId: MODEL_ID });
      return loadNemotronSessions(emit);
    }
    throw error;
  });
  return sessionsPromise;
};
