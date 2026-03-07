import { file as opfsFile } from "@memora/fs";

import {
  DEFAULT_AUDIO_MIME,
  type FileType,
  type RecordingMeta,
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
  parentId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
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
    parentId: input.parentId ?? null,
    positionX: input.positionX ?? null,
    positionY: input.positionY ?? null,
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

export const getRecordingAudioUrl = async (meta: RecordingMeta): Promise<string | null> => {
  const blob = await resolveAudioBlob(meta);
  if (!blob) return null;
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

export const getMediaDuration = (blob: Blob): Promise<number | null> => {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement("video");

    const cleanup = () => {
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 10_000);

    el.preload = "metadata";

    el.addEventListener(
      "loadedmetadata",
      () => {
        clearTimeout(timer);
        const dur = el.duration;
        cleanup();
        resolve(Number.isFinite(dur) && dur > 0 ? dur : null);
      },
      { once: true },
    );

    el.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        cleanup();
        resolve(null);
      },
      { once: true },
    );

    el.src = url;
  });
};

export const resolveRecordingBlob = async (meta: RecordingMeta) => resolveAudioBlob(meta);

export const resolveRecordingFile = async (meta: RecordingMeta): Promise<File | null> => {
  try {
    const originFile = await opfsFile(meta.storagePath).getOriginFile();
    if (originFile) return originFile;
  } catch {
    // fall through
  }
  const blob = await resolveRecordingBlob(meta);
  if (!blob) return null;
  return new File([blob], meta.name, { type: meta.mimeType || DEFAULT_AUDIO_MIME });
};
