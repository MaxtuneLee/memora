export type FileType = "audio" | "video" | "image" | "document";
export type StorageType = "opfs" | "s3" | "url";

export interface RecordingWord {
  text: string;
  timestamp: [number, number];
}

export interface RecordingTranscript {
  text: string;
  words: RecordingWord[];
}

export interface RecordingMeta {
  id: string;
  name: string;
  type: FileType;
  mimeType: string;
  sizeBytes: number;
  storageType: StorageType;
  storagePath: string;
  metaPath: string;
  createdAt: number;
  updatedAt: number;
  durationSec?: number | null;
  transcriptPath?: string | null;
  transcriptPreview?: string | null;
}

export interface RecordingItem extends RecordingMeta {
  audioUrl?: string;
  transcript?: RecordingTranscript | null;
}

export const FILES_DIR = "/files";
export const LEGACY_RECORDINGS_DIR = "/recordings";
export const FILE_META_SUFFIX = ".meta.json";
export const TRANSCRIPT_SUFFIX = ".transcript.json";
export const DEFAULT_AUDIO_EXTENSION = "webm";
export const DEFAULT_AUDIO_MIME = "audio/webm";
