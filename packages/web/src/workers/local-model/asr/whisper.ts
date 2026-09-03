import { env, pipeline, type ProgressCallback } from "@huggingface/transformers";
import type { LocalAsrEvent, LocalAsrRequest } from "@memora/local-model-runtime";

import {
  clearTransformersModelCache,
  configureTransformersCache,
  isTransformersModelCacheCorruptionError,
} from "../cache";
import { reportWorkerRuntimeLoaded } from "../debug";

const WHISPER_TIMESTAMPED_MODEL = "onnx-community/whisper-base_timestamped";
const WHISPER_MAX_TOKENS_PER_SECOND = 8;
const WHISPER_MIN_NEW_TOKENS = 24;

env.allowLocalModels = false;
configureTransformersCache(env);

interface ProgressItem {
  status?: string;
  file?: string;
  progress?: number;
  total?: number;
}

type TimestampedTranscription = {
  text: string;
  chunks?: Array<{ text: string; timestamp: [number, number] }>;
};

type Transcriber = (
  audio: Float32Array,
  options: {
    language?: string;
    task?: "transcribe";
    return_timestamps?: "word";
    chunk_length_s?: number;
    max_new_tokens?: number;
  },
) => Promise<TimestampedTranscription>;

const getMaxNewTokens = (audioLength: number): number => {
  return Math.max(
    WHISPER_MIN_NEW_TOKENS,
    Math.ceil((audioLength / 16_000) * WHISPER_MAX_TOKENS_PER_SECOND),
  );
};

class WhisperPipeline {
  static instance: Transcriber | null = null;
  static ready = false;
  static cacheRecoveryAttempted = false;

  static async getInstance(progressCallback: ProgressCallback): Promise<Transcriber> {
    if (!this.instance) {
      console.warn("[whisper] pipeline load start", { model: WHISPER_TIMESTAMPED_MODEL });
      this.instance = (await pipeline(
        "automatic-speech-recognition",
        WHISPER_TIMESTAMPED_MODEL,
        {
          progress_callback: progressCallback,
          dtype: {
            encoder_model: "fp32",
            decoder_model_merged: "fp32",
          },
          device: "webgpu",
        },
      )) as unknown as Transcriber;
      console.warn("[whisper] pipeline load complete", { model: WHISPER_TIMESTAMPED_MODEL });
      reportWorkerRuntimeLoaded({
        family: "whisper",
        modelId: WHISPER_TIMESTAMPED_MODEL,
        adapter: "whisper",
        runtime: "transformers-js",
      });
    }

    return this.instance;
  }

  static async getReadyInstance(progressCallback: ProgressCallback): Promise<Transcriber> {
    try {
      const transcriber = await this.getInstance(progressCallback);
      if (!this.ready) {
        await transcriber(new Float32Array(16_000), {
          return_timestamps: "word",
        });
        this.ready = true;
      }
      return transcriber;
    } catch (error) {
      if (!this.cacheRecoveryAttempted && isTransformersModelCacheCorruptionError(error)) {
        this.cacheRecoveryAttempted = true;
        this.instance = null;
        this.ready = false;
        console.warn("[whisper] corrupt cache detected; clearing and retrying", {
          model: WHISPER_TIMESTAMPED_MODEL,
        });
        await clearTransformersModelCache({ modelId: WHISPER_TIMESTAMPED_MODEL });
        return this.getReadyInstance(progressCallback);
      }
      throw error;
    }
  }
}

const toProgressEvent = (item: ProgressItem): LocalAsrEvent | null => {
  if (!item.file && item.progress === undefined && item.total === undefined) return null;
  return {
    type: "model-progress",
    ...(item.file ? { file: item.file } : {}),
    ...(item.progress !== undefined ? { progress: item.progress } : {}),
    ...(item.total !== undefined ? { total: item.total } : {}),
  };
};

export const loadWhisperTranscriber = async (
  emit: (event: LocalAsrEvent) => void,
): Promise<void> => {
  emit({ type: "status", status: "loading-model" });
  await WhisperPipeline.getReadyInstance((progress) => {
    const event = toProgressEvent(progress as ProgressItem);
    if (event) emit(event);
  });
};

export const runWhisperTranscription = async (
  request: LocalAsrRequest,
  emit: (event: LocalAsrEvent) => void,
): Promise<void> => {
  emit({ type: "status", status: "loading-model" });
  const transcriber = await WhisperPipeline.getReadyInstance((progress) => {
    const event = toProgressEvent(progress as ProgressItem);
    if (event) emit(event);
  });

  emit({ type: "status", status: "running" });
  const result = await transcriber(request.audio, {
    language: request.language,
    task: "transcribe",
    return_timestamps: request.returnTimestamps ?? "word",
    chunk_length_s: 30,
    max_new_tokens: getMaxNewTokens(request.audio.length),
  });

  emit({
    type: "transcript-complete",
    text: result.text,
    chunks: result.chunks,
    audioLength: request.audio.length,
  });
};
