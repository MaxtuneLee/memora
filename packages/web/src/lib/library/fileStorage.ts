import {
  dir as opfsDir,
  file as opfsFile,
  write as opfsWrite,
} from "@memora/fs";

import {
  DEFAULT_AUDIO_EXTENSION,
  DEFAULT_AUDIO_MIME,
  FILES_DIR,
  FILE_META_SUFFIX,
  LEGACY_RECORDINGS_DIR,
  TRANSCRIPT_SUFFIX,
  type FileType,
  type RecordingMeta,
  type RecordingTranscript,
  type StorageType,
} from "@/types/library";

type LegacyRecordingMeta = {
  id: string;
  createdAt: number;
  durationSec: number;
  text: string;
  words: RecordingTranscript["words"];
  audioPath: string;
  mimeType: string;
};

const buildFileDirPath = (id: string) => `${FILES_DIR}/${id}`;

const buildFileBasePath = (id: string) => `${buildFileDirPath(id)}/${id}`;

const buildMetaPath = (id: string) =>
  `${buildFileDirPath(id)}/${id}${FILE_META_SUFFIX}`;

const buildTranscriptPath = (id: string) =>
  `${buildFileDirPath(id)}/${id}${TRANSCRIPT_SUFFIX}`;

const ensureFilesDir = async () => {
  const filesDir = opfsDir(FILES_DIR);
  const exists = await filesDir.exists();
  if (!exists) {
    await filesDir.create();
  }
  return filesDir;
};

export type SaveFileInput = {
  id?: string;
  blob: Blob;
  name: string;
  type: FileType;
  mimeType?: string;
  durationSec?: number | null;
  transcript?: RecordingTranscript | null;
  storageType?: StorageType;
  parentId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  createdAt?: number;
};

export type SaveFileResult = {
  id: string;
  meta: RecordingMeta;
};

export type LegacyRecording = {
  meta: RecordingMeta;
  transcript: RecordingTranscript | null;
};

export const saveFileToOpfs = async (
  input: SaveFileInput,
): Promise<SaveFileResult> => {
  await ensureFilesDir();

  const id = input.id ?? crypto.randomUUID();
  const fileDirPath = buildFileDirPath(id);
  const createdAt = input.createdAt ?? Date.now();
  const updatedAt = createdAt;
  const storageType = input.storageType ?? "opfs";
  const mimeType = input.mimeType ?? (input.blob.type || DEFAULT_AUDIO_MIME);
  const extension = mimeType.split("/")[1] || DEFAULT_AUDIO_EXTENSION;
  const storagePath = `${buildFileBasePath(id)}.${extension}`;
  const metaPath = buildMetaPath(id);
  const transcriptPath = buildTranscriptPath(id);

  await opfsDir(fileDirPath).create();

  await opfsWrite(storagePath, await input.blob.arrayBuffer(), {
    overwrite: true,
  });

  if (input.transcript) {
    await opfsWrite(transcriptPath, JSON.stringify(input.transcript), {
      overwrite: true,
    });
  }

  const meta: RecordingMeta = {
    id,
    name: input.name,
    type: input.type,
    mimeType,
    sizeBytes: input.blob.size,
    storageType,
    storagePath,
    metaPath,
    parentId: input.parentId ?? null,
    positionX: input.positionX ?? null,
    positionY: input.positionY ?? null,
    createdAt,
    updatedAt,
    durationSec: input.durationSec ?? null,
    transcriptPath: input.transcript ? transcriptPath : null,
    transcriptPreview: input.transcript?.text?.slice(0, 280) ?? null,
  };

  await opfsWrite(metaPath, JSON.stringify(meta), { overwrite: true });

  return { id, meta };
};

export const loadTranscript = async (
  transcriptPath: string,
): Promise<RecordingTranscript | null> => {
  try {
    const transcriptText = await opfsFile(transcriptPath).text();
    return JSON.parse(transcriptText) as RecordingTranscript;
  } catch {
    return null;
  }
};

export const listFilesFromOpfs = async (): Promise<RecordingMeta[]> => {
  await ensureFilesDir();
  const filesDir = opfsDir(FILES_DIR);
  const children = await filesDir.children();
  const metas: RecordingMeta[] = [];

  for (const child of children) {
    try {
      if (child.kind === "file" && child.name.endsWith(FILE_META_SUFFIX)) {
        const metaText = await opfsFile(child.path).text();
        metas.push(JSON.parse(metaText) as RecordingMeta);
        continue;
      }

      if (child.kind === "dir") {
        const metaPath = `${child.path}/${child.name}${FILE_META_SUFFIX}`;
        const metaFile = opfsFile(metaPath);
        if (await metaFile.exists()) {
          const metaText = await metaFile.text();
          metas.push(JSON.parse(metaText) as RecordingMeta);
        }
      }
    } catch {
      continue;
    }
  }

  return metas;
};

export const deleteFileFromOpfs = async (meta: RecordingMeta) => {
  await opfsFile(meta.metaPath).remove({ force: true });
  await opfsFile(meta.storagePath).remove({ force: true });
  if (meta.transcriptPath) {
    await opfsFile(meta.transcriptPath).remove({ force: true });
  }
  const dirPath = buildFileDirPath(meta.id);
  try {
    await opfsDir(dirPath).remove();
  } catch (e) {
    // Ignore if directory is missing or not empty.
    console.warn(`Failed to remove directory ${dirPath}:`, e);
  }
};

export const listLegacyRecordings = async (): Promise<LegacyRecording[]> => {
  const recordingsDir = opfsDir(LEGACY_RECORDINGS_DIR);
  const exists = await recordingsDir.exists();
  if (!exists) return [];
  const children = await recordingsDir.children();
  const metas = await Promise.all(
    children
      .filter((child) => child.kind === "file" && child.name.endsWith(".json"))
      .map(async (child) => {
        const metaText = await opfsFile(child.path).text();
        const legacy = JSON.parse(metaText) as LegacyRecordingMeta;
        const transcript: RecordingTranscript = {
          text: legacy.text,
          words: legacy.words,
        };
        const meta = {
          id: legacy.id,
          name: "Recording",
          type: "audio",
          mimeType: legacy.mimeType,
          sizeBytes: 0,
          storageType: "opfs",
          storagePath: legacy.audioPath,
          metaPath: buildMetaPath(legacy.id),
          createdAt: legacy.createdAt,
          updatedAt: legacy.createdAt,
          durationSec: legacy.durationSec,
          transcriptPath:
            legacy.text || legacy.words.length > 0
              ? buildTranscriptPath(legacy.id)
              : null,
          transcriptPreview: legacy.text ? legacy.text.slice(0, 280) : null,
        } satisfies RecordingMeta;
        return {
          meta,
          transcript,
        } satisfies LegacyRecording;
      }),
  );
  return metas;
};

export const migrateLegacyRecording = async (
  meta: RecordingMeta,
  transcript?: RecordingTranscript | null,
) => {
  await opfsDir(buildFileDirPath(meta.id)).create();
  if (!meta.transcriptPath || !transcript) {
    await opfsWrite(meta.metaPath, JSON.stringify(meta), { overwrite: true });
    return;
  }
  await opfsWrite(meta.transcriptPath, JSON.stringify(transcript), {
    overwrite: true,
  });
  await opfsWrite(meta.metaPath, JSON.stringify(meta), { overwrite: true });
};

export const resolveAudioBlob = async (
  meta: RecordingMeta,
): Promise<Blob | null> => {
  try {
    const audioFile = opfsFile(meta.storagePath);
    const originFile = await audioFile.getOriginFile();
    return (
      originFile ??
      new Blob([await audioFile.arrayBuffer()], {
        type: meta.mimeType || DEFAULT_AUDIO_MIME,
      })
    );
  } catch {
    return null;
  }
};
