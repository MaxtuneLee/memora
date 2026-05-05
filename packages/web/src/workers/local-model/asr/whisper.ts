import { pipeline, type ProgressCallback } from "@huggingface/transformers";
import type { LocalAsrEvent, LocalAsrRequest } from "@memora/local-model-runtime";

import { reportWorkerRuntimeLoaded } from "../debug";

const WHISPER_TIMESTAMPED_MODEL = "onnx-community/whisper-base_timestamped";
const WHISPER_MAX_TOKENS_PER_SECOND = 8;
const WHISPER_MIN_NEW_TOKENS = 24;

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

  static async getInstance(progressCallback: ProgressCallback): Promise<Transcriber> {
    if (!this.instance) {
      this.instance = (await pipeline("automatic-speech-recognition", WHISPER_TIMESTAMPED_MODEL, {
        progress_callback: progressCallback,
        dtype: {
          encoder_model: "fp32",
          decoder_model_merged: "fp32",
        },
        device: "webgpu",
      })) as unknown as Transcriber;
      reportWorkerRuntimeLoaded({
        family: "whisper",
        modelId: WHISPER_TIMESTAMPED_MODEL,
        adapter: "whisper",
        runtime: "transformers-js",
      });
    }

    return this.instance;
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
  const transcriber = await WhisperPipeline.getInstance((progress) => {
    const event = toProgressEvent(progress as ProgressItem);
    if (event) emit(event);
  });
  await transcriber(new Float32Array(16_000), {
    return_timestamps: "word",
  });
};

export const runWhisperTranscription = async (
  request: LocalAsrRequest,
  emit: (event: LocalAsrEvent) => void,
): Promise<void> => {
  emit({ type: "status", status: "loading-model" });
  const transcriber = await WhisperPipeline.getInstance((progress) => {
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
