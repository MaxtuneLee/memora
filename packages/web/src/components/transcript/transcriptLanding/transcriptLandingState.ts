import type { FileType, RecordingItem } from "@/types/library";

const LANGUAGE_LABELS: Record<string, string> = {
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
};

const FILE_TYPE_LABELS: Record<FileType, string> = {
  audio: "Audio",
  document: "Document",
  image: "Image",
  video: "Video",
};

export interface TranscriptWorkbenchRailItem {
  id: "language" | "recordings";
  label: string;
  value: string;
}

export interface TranscriptHistoryRowState {
  title: string;
  preview: string;
  status: "Transcript ready" | "No transcript yet";
  typeLabel: string;
  timestamp: number;
  timestampSource: "updatedAt" | "createdAt";
  durationSec: number | null | undefined;
  showDuration: boolean;
}

interface TranscriptWorkbenchRailItemsInput {
  language: string;
  recordings: RecordingItem[];
}

const formatRecordingCount = (count: number): string => {
  return `${count} recording${count === 1 ? "" : "s"}`;
};

const getLanguageLabel = (language: string): string => {
  const normalized = language.trim().toLowerCase();
  if (!normalized) return LANGUAGE_LABELS.en;
  return LANGUAGE_LABELS[normalized] ?? language.trim().toUpperCase();
};

export function getTranscriptWorkbenchRailItems(
  input: TranscriptWorkbenchRailItemsInput,
): TranscriptWorkbenchRailItem[] {
  return [
    {
      id: "language",
      label: "Language",
      value: getLanguageLabel(input.language),
    },
    {
      id: "recordings",
      label: "Loaded",
      value: formatRecordingCount(input.recordings.length),
    },
  ];
}

const getPreviewText = (recording: RecordingItem): string => {
  const transcriptText = recording.transcript?.text?.trim();
  if (transcriptText) return transcriptText;

  const transcriptPreview = recording.transcriptPreview?.trim();
  if (transcriptPreview) return transcriptPreview;

  return "No transcript yet.";
};

const hasTranscriptContent = (recording: RecordingItem): boolean => {
  if (recording.transcript?.diagnostics) return true;
  if (recording.transcript?.text?.trim()) return true;
  if ((recording.transcript?.words.length ?? 0) > 0) return true;
  if (recording.transcriptPreview?.trim()) return true;
  return false;
};

const getTimestampState = (
  recording: RecordingItem,
): Pick<TranscriptHistoryRowState, "timestamp" | "timestampSource"> => {
  if (Number.isFinite(recording.updatedAt)) {
    return {
      timestamp: recording.updatedAt,
      timestampSource: "updatedAt",
    };
  }

  return {
    timestamp: recording.createdAt,
    timestampSource: "createdAt",
  };
};

export function getTranscriptHistoryRowState(recording: RecordingItem): TranscriptHistoryRowState {
  const preview = getPreviewText(recording);

  return {
    title: recording.name,
    preview,
    status: hasTranscriptContent(recording) ? "Transcript ready" : "No transcript yet",
    typeLabel: FILE_TYPE_LABELS[recording.type],
    ...getTimestampState(recording),
    durationSec: recording.durationSec,
    showDuration: recording.durationSec !== undefined && recording.durationSec !== null,
  };
}
