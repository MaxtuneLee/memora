import type { Store } from "@livestore/livestore";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { createWhisperTranscriptionProvider } from "@/lib/transcript/providers/whisper";
import type {
  TranscriptionProvider,
  TranscriptionTimestampLevel,
} from "@/lib/transcript/providers/types";
import {
  normalizeAiModelRouting,
  resolveFeatureModelTarget,
  type AiModelRouting,
  type CloudModelTarget,
} from "./modelRouting";

export interface TranscriptionRuntime {
  provider: TranscriptionProvider;
  modelId: string;
  timestamps: TranscriptionTimestampLevel;
}

// The host binds a provider account to its authenticated adapter. Never infer
// an ASR protocol from a chat API format or reuse another account's connection.
export type ResolveCloudTranscriptionProvider = (
  target: Readonly<CloudModelTarget>,
) => TranscriptionProvider;

export const createTranscriptionRuntime = (
  routing: AiModelRouting,
  resolveCloud?: ResolveCloudTranscriptionProvider,
): TranscriptionRuntime => {
  const target = resolveFeatureModelTarget("transcription", routing);
  let provider: TranscriptionProvider;
  if (target.source === "local") {
    provider = createWhisperTranscriptionProvider();
  } else {
    if (!resolveCloud)
      throw new Error(
        "Cloud transcription is selected, but its authenticated connection is not configured on this device.",
      );
    provider = resolveCloud({ ...target });
  }
  const capabilities = provider.getCapabilities(target.modelId);
  if (!capabilities.sampleRates.includes(16000) || !capabilities.segmentation.includes("manual")) {
    throw new Error(
      "This transcription provider does not support the audio format required by this app.",
    );
  }
  const timestamps = capabilities.timestamps.includes("word")
    ? "word"
    : capabilities.timestamps.includes("segment")
      ? "segment"
      : "none";
  if (!capabilities.timestamps.includes(timestamps))
    throw new Error("The transcription provider has no supported timestamp mode.");
  return { provider, modelId: target.modelId, timestamps };
};

/** Read when the user starts a task, not on every render or every audio chunk. */
export const readTranscriptionRuntime = (
  store: Pick<Store, "query">,
  resolveCloud?: ResolveCloudTranscriptionProvider,
): TranscriptionRuntime => {
  const settings = store.query(settingsDocumentQuery$);
  return createTranscriptionRuntime(
    normalizeAiModelRouting(settings?.modelRouting, settings),
    resolveCloud,
  );
};
