import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@livestore/react";

import {
  deleteRecording as deleteFileFromStore,
  getRecordingAudioUrl,
  getRecordingTranscript,
} from "@/lib/library/fileService";
import { activeFilesQuery$ } from "@/lib/library/queries";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import { type FileItem, type FileMeta } from "@/types/library";
import { fileEvents, type file as LiveStoreFile } from "@/livestore/file";

interface UseFilesOptions {
  mediaOnly?: boolean;
}

const isMediaFile = (file: Pick<FileMeta, "type">): boolean => {
  return file.type === "audio" || file.type === "video";
};

export const useFiles = (options: UseFilesOptions = {}) => {
  const { mediaOnly = false } = options;
  const { store } = useStore();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const audioUrlCacheRef = useRef<Map<string, string>>(new Map());
  const fileRows = store.useQuery(activeFilesQuery$);

  const buildFiles = useCallback(
    async (rows: readonly LiveStoreFile[]) => {
      const eligibleRows = mediaOnly ? rows.filter((file) => isMediaFile(file)) : rows;

      return Promise.all(
        eligibleRows.map(async (row) => {
          const meta = mapLiveStoreFileToMeta(row);
          let transcript = null;

          if (isMediaFile(meta) && meta.transcriptPath) {
            try {
              transcript = await getRecordingTranscript(meta);
            } catch {
              transcript = null;
            }
          }

          return {
            ...meta,
            transcript,
            transcriptPreview: transcript?.text?.slice(0, 280) ?? meta.transcriptPreview ?? null,
            audioUrl: isMediaFile(meta) ? audioUrlCacheRef.current.get(meta.id) : undefined,
          } satisfies FileItem;
        }),
      );
    },
    [mediaOnly],
  );

  const refreshFiles = useCallback(async () => {
    const nextFiles = await buildFiles(fileRows);
    setFiles(nextFiles);
  }, [buildFiles, fileRows]);

  const getFileAudioUrl = useCallback(async (meta: FileItem) => {
    if (!isMediaFile(meta)) return null;

    const cached = audioUrlCacheRef.current.get(meta.id);
    if (cached) return cached;

    const url = await getRecordingAudioUrl(meta);
    if (url) {
      audioUrlCacheRef.current.set(meta.id, url);
    }
    return url;
  }, []);

  const selectFile = useCallback(
    async (meta: FileItem) => {
      const url = await getFileAudioUrl(meta);
      setFiles((prev) =>
        prev.map((item) => (item.id === meta.id ? { ...item, audioUrl: url ?? undefined } : item)),
      );
      setActiveFileId(meta.id);
    },
    [getFileAudioUrl],
  );

  const deleteFile = useCallback(
    async (file: FileMeta) => {
      await deleteFileFromStore(file);
      store.commit(
        fileEvents.fileDeleted({
          id: file.id,
          deletedAt: new Date(),
        }),
      );

      const cached = audioUrlCacheRef.current.get(file.id);
      if (cached) {
        URL.revokeObjectURL(cached);
        audioUrlCacheRef.current.delete(file.id);
      }

      setActiveFileId((prev) => (prev === file.id ? null : prev));
    },
    [store],
  );

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  useEffect(() => {
    const urls = audioUrlCacheRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  return {
    files,
    activeFileId,
    selectFile,
    refreshFiles,
    getFileAudioUrl,
    setActiveFileId,
    deleteFile,
  };
};
