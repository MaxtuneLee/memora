import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@livestore/react";

import type { RecordingItem, RecordingMeta } from "../lib/files";
import {
  deleteRecording as deleteRecordingService,
  getRecordingAudioUrl,
  getRecordingTranscript,
} from "../lib/fileService";
import { FILES_DIR, FILE_META_SUFFIX } from "../lib/files";
import {
  fileEvents,
  fileTable,
  type file as LiveStoreFile,
} from "../livestore/file";
import { queryDb } from "@livestore/livestore";

const query$ = queryDb(
  (_store) => {
    return fileTable
      .where({ deletedAt: null })
      .orderBy("createdAt", "desc");
  },
  {
    label: "useRecordings:query",
  },
);

/**
 * Hook to manage and interact with recordings.
 * @returns
 */
export const useRecordings = () => {
  const { store } = useStore();
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(
    null,
  );
  const audioUrlCacheRef = useRef<Map<string, string>>(new Map());
  const fileRows = store.useQuery(query$);

  const mapToMeta = useCallback((file: LiveStoreFile): RecordingMeta => {
    const createdAt =
      file.createdAt instanceof Date ? file.createdAt.getTime() : Date.now();
    const updatedAt =
      file.updatedAt instanceof Date ? file.updatedAt.getTime() : createdAt;
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
        transcriptPreview: null,
    };
  }, []);

  const buildRecordings = useCallback(
    async (files: readonly LiveStoreFile[]) => {
      const eligibleFiles = files.filter(
        (file) => file.type === "audio" || file.type === "video",
      );
      const recordingsWithCache = await Promise.all(
        eligibleFiles.map(async (file) => {
          const meta = mapToMeta(file);
          let transcript = null;
          try {
            transcript = meta.transcriptPath
              ? await getRecordingTranscript(meta)
              : null;
          } catch {
            // skip missing transcript
          }
          const cachedUrl = audioUrlCacheRef.current.get(meta.id);
          return {
            ...meta,
            transcript,
            transcriptPreview: transcript?.text?.slice(0, 280) ?? null,
            audioUrl: cachedUrl,
          } satisfies RecordingItem;
        }),
      );

      return recordingsWithCache;
    },
    [mapToMeta],
  );

  const refreshRecordings = useCallback(async () => {
    console.log("Refreshed recordings", fileRows);
    const items = await buildRecordings(fileRows);
    setRecordings(items);
  }, [buildRecordings, fileRows]);

  const getRecordingAudioUrlWithCache = useCallback(
    async (meta: RecordingItem) => {
      const cached = audioUrlCacheRef.current.get(meta.id);
      if (cached) return cached;

      const url = await getRecordingAudioUrl(meta);
      if (url) audioUrlCacheRef.current.set(meta.id, url);
      return url;
    },
    [],
  );

  const selectRecording = useCallback(
    async (meta: RecordingItem) => {
      const url = await getRecordingAudioUrlWithCache(meta);
      setRecordings((prev) =>
        prev.map((item) =>
          item.id === meta.id ? { ...item, audioUrl: url ?? undefined } : item,
        ),
      );
      setActiveRecordingId(meta.id);
    },
    [getRecordingAudioUrlWithCache],
  );

  const deleteRecording = useCallback(
    async (recording: RecordingMeta) => {
      await deleteRecordingService(recording);
      store.commit(
        fileEvents.fileDeleted({
          id: recording.id,
          deletedAt: new Date(),
        }),
      );

      const cached = audioUrlCacheRef.current.get(recording.id);
      if (cached) {
        URL.revokeObjectURL(cached);
        audioUrlCacheRef.current.delete(recording.id);
      }
      setActiveRecordingId((prev) => (prev === recording.id ? null : prev));
    },
    [store],
  );

  useEffect(() => {
    void refreshRecordings();
  }, [refreshRecordings]);

  useEffect(() => {
    const urls = audioUrlCacheRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  return {
    recordings,
    activeRecordingId,
    selectRecording,
    refreshRecordings,
    getRecordingAudioUrl: getRecordingAudioUrlWithCache,
    setActiveRecordingId,
    deleteRecording,
  };
};
