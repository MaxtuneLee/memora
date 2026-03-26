import type { file as LiveStoreFile } from "@/livestore/file";
import { FILES_DIR, FILE_META_SUFFIX, type FileMeta } from "@/types/library";

export const mapLiveStoreFileToMeta = (file: LiveStoreFile): FileMeta => {
  const createdAt = file.createdAt instanceof Date ? file.createdAt.getTime() : Date.now();
  const updatedAt = file.updatedAt instanceof Date ? file.updatedAt.getTime() : createdAt;

  return {
    id: file.id,
    name: file.name,
    type: file.type,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    storageType: file.storageType,
    storagePath: file.storagePath,
    metaPath: `${FILES_DIR}/${file.id}/${file.id}${FILE_META_SUFFIX}`,
    parentId: file.parentId ?? null,
    positionX: file.positionX ?? null,
    positionY: file.positionY ?? null,
    createdAt,
    updatedAt,
    durationSec: file.durationSec ?? null,
    transcriptPath: file.transcriptPath ?? null,
    transcriptPreview: file.indexSummary ?? null,
  };
};
