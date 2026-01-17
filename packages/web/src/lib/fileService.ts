import { file as opfsFile } from "opfs-tools";

import {
  DEFAULT_AUDIO_MIME,
  type FileType,
  type RecordingMeta,
  type RecordingTranscript,
  type RecordingWord,
  type StorageType,
} from "./files";
import {
  deleteFileFromOpfs,
  listFilesFromOpfs,
  listLegacyRecordings,
  loadTranscript,
  migrateLegacyRecording,
  resolveAudioBlob,
  saveFileToOpfs,
} from "./fileStorage";

const buildRecordingName = (timestamp: number) =>
  `Recording ${new Date(timestamp).toLocaleString()}`;

export type SaveRecordingInput = {
  id?: string;
  blob: Blob;
  name?: string;
  type?: FileType;
  mimeType?: string;
  durationSec?: number | null;
  transcriptText?: string;
  transcriptWords?: RecordingWord[];
  storageType?: StorageType;
  createdAt?: number;
};

export type SaveRecordingResult = {
  id: string;
  meta: RecordingMeta;
};

export const saveRecording = async (input: SaveRecordingInput): Promise<SaveRecordingResult> => {
  const createdAt = input.createdAt ?? Date.now();
  const transcript =
    input.transcriptText || (input.transcriptWords?.length ?? 0) > 0
      ? {
          text: input.transcriptText ?? "",
          words: input.transcriptWords ?? [],
        }
      : null;

  return saveFileToOpfs({
    id: input.id,
    blob: input.blob,
    name: input.name ?? buildRecordingName(createdAt),
    type: input.type ?? "audio",
    mimeType: input.mimeType ?? (input.blob.type || DEFAULT_AUDIO_MIME),
    durationSec: input.durationSec ?? null,
    transcript,
    storageType: input.storageType ?? "opfs",
    createdAt,
  });
};

export const listRecordings = async (): Promise<RecordingMeta[]> => {
  const [current, legacy] = await Promise.all([listFilesFromOpfs(), listLegacyRecordings()]);
  const merged = new Map<string, RecordingMeta>();
  for (const meta of current) {
    merged.set(meta.id, meta);
  }
  for (const legacyItem of legacy) {
    if (!merged.has(legacyItem.meta.id)) {
      merged.set(legacyItem.meta.id, legacyItem.meta);
    }
  }
  return Array.from(merged.values());
};

export const deleteRecording = async (meta: RecordingMeta) => {
  await deleteFileFromOpfs(meta);
};

export const getRecordingAudioUrl = async (meta: RecordingMeta) => {
  const blob = await resolveAudioBlob(meta);
  return URL.createObjectURL(blob);
};

export const getRecordingTranscript = async (meta: RecordingMeta) => {
  if (!meta.transcriptPath) return null;
  return loadTranscript(meta.transcriptPath);
};

export const migrateLegacyRecordings = async () => {
  const legacyMetas = await listLegacyRecordings();
  await Promise.all(
    legacyMetas.map(async ({ meta, transcript }) => {
      await migrateLegacyRecording(meta, transcript);
    })
  );
};

export const resolveRecordingBlob = async (meta: RecordingMeta) => resolveAudioBlob(meta);

export const resolveRecordingFile = async (meta: RecordingMeta) => {
  const originFile = await opfsFile(meta.storagePath).getOriginFile();
  if (originFile) return originFile;
  const blob = await resolveRecordingBlob(meta);
  return new File([blob], meta.name, { type: meta.mimeType || DEFAULT_AUDIO_MIME });
};
