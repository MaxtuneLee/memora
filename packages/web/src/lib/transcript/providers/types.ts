export type TranscriptionSegmentation = "automatic" | "manual";
export type TranscriptionTimestampLevel = "none" | "segment" | "word";

export interface TranscriptionCapabilities {
  sampleRates: readonly number[];
  segmentation: readonly TranscriptionSegmentation[];
  timestamps: readonly TranscriptionTimestampLevel[];
  partialResults: boolean;
}

export interface TranscriptSegment {
  id: string;
  revision: number;
  text: string;
  isFinal: boolean;
  startSeconds?: number;
  endSeconds?: number;
  words?: Array<{ text: string; startSeconds?: number; endSeconds?: number }>;
}

export type TranscriptionEvent =
  | { type: "segment"; segment: TranscriptSegment }
  | { type: "state"; state: "ready" | "draining" | "closed" }
  | { type: "progress"; label: string; progress?: number }
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface TranscriptionOptions {
  modelId: string;
  sampleRate: number;
  language?: string;
  segmentation: TranscriptionSegmentation;
  timestamps: TranscriptionTimestampLevel;
  signal?: AbortSignal;
}

export interface TranscriptionSession {
  /** Ordered mono Float32 PCM. Await for backpressure; samples are copied before returning. */
  write(samples: Float32Array): Promise<void>;
  /** Ends an utterance, not the session. Available only in manual mode. */
  commit?: () => Promise<void>;
  /** Drains all accepted audio and requested metadata before closing. Idempotent. */
  finish(): Promise<void>;
  /** Discards unfinished output and releases resources. Idempotent. */
  abort(): void;
}

export interface TranscriptionProvider {
  readonly adapterId: string;
  getCapabilities(modelId: string): TranscriptionCapabilities;
  open(
    options: TranscriptionOptions,
    onEvent: (event: TranscriptionEvent) => void,
  ): Promise<TranscriptionSession>;
}

export const validateTranscriptionOptions = (
  options: TranscriptionOptions,
  capabilities: TranscriptionCapabilities,
): void => {
  options.signal?.throwIfAborted();
  if (!capabilities.sampleRates.includes(options.sampleRate))
    throw new Error("Unsupported transcription sample rate.");
  if (!capabilities.segmentation.includes(options.segmentation))
    throw new Error("Unsupported transcription segmentation mode.");
  if (!capabilities.timestamps.includes(options.timestamps))
    throw new Error("This transcription model does not provide the requested timestamps.");
};

export const validateAudioSamples = (samples: Float32Array): void => {
  if (!samples.every(Number.isFinite)) throw new Error("Audio contains invalid samples.");
};
