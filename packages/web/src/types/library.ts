export type FileType = "audio" | "video" | "image" | "document";
export type StorageType = "opfs" | "s3" | "url";

export interface TranscriptWord {
  text: string;
  timestamp: [number, number];
}

export interface TranscriptData {
  text: string;
  words: TranscriptWord[];
}

export interface FileMeta {
  id: string;
  name: string;
  type: FileType;
  mimeType: string;
  sizeBytes: number;
  storageType: StorageType;
  storagePath: string;
  metaPath: string;
  parentId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  createdAt: number;
  updatedAt: number;
  durationSec?: number | null;
  transcriptPath?: string | null;
  transcriptPreview?: string | null;
}

export interface FileItem extends FileMeta {
  audioUrl?: string;
  transcript?: TranscriptData | null;
}

export type RecordingWord = TranscriptWord;
export type RecordingTranscript = TranscriptData;
export type RecordingMeta = FileMeta;
export type RecordingItem = FileItem;

export const FILES_DIR = "/files";
export const LEGACY_RECORDINGS_DIR = "/recordings";
export const FILE_META_SUFFIX = ".meta.json";
export const TRANSCRIPT_SUFFIX = ".transcript.json";
export const DEFAULT_AUDIO_EXTENSION = "webm";
export const DEFAULT_AUDIO_MIME = "audio/webm";
