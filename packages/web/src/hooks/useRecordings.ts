import { useCallback, useEffect, useRef, useState } from "react";

import type { RecordingItem, RecordingMeta } from "../lib/files";
import {
  deleteRecording as deleteRecordingService,
  getRecordingAudioUrl,
  getRecordingTranscript,
  listRecordings,
  migrateLegacyRecordings,
} from "../lib/fileService";

export const useRecordings = () => {
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const audioUrlCacheRef = useRef<Map<string, string>>(new Map());

  const refreshRecordings = useCallback(async () => {
    await migrateLegacyRecordings();
    const metas = await listRecordings();
    metas.sort((a, b) => b.createdAt - a.createdAt);

    const recordingsWithCache = await Promise.all(
      metas.map(async (meta) => {
        const transcript = meta.transcriptPath
          ? await getRecordingTranscript(meta)
          : null;
        const cachedUrl = audioUrlCacheRef.current.get(meta.id);
        return {
          ...meta,
          transcript,
          audioUrl: cachedUrl,
        } satisfies RecordingItem;
      })
    );

    setRecordings(recordingsWithCache);
  }, []);

  const getRecordingAudioUrlWithCache = useCallback(async (meta: RecordingItem) => {
    const cached = audioUrlCacheRef.current.get(meta.id);
    if (cached) return cached;

    const url = await getRecordingAudioUrl(meta);
    audioUrlCacheRef.current.set(meta.id, url);
    return url;
  }, []);

  const selectRecording = useCallback(
    async (meta: RecordingItem) => {
      const url = await getRecordingAudioUrlWithCache(meta);
      setRecordings((prev) =>
        prev.map((item) =>
          item.id === meta.id ? { ...item, audioUrl: url } : item
        )
      );
      setActiveRecordingId(meta.id);
    },
    [getRecordingAudioUrlWithCache]
  );

  const deleteRecording = useCallback(async (recording: RecordingMeta) => {
    await deleteRecordingService(recording);

    const cached = audioUrlCacheRef.current.get(recording.id);
    if (cached) {
      URL.revokeObjectURL(cached);
      audioUrlCacheRef.current.delete(recording.id);
    }

    setRecordings((prev) => prev.filter((item) => item.id !== recording.id));
    setActiveRecordingId((prev) => (prev === recording.id ? null : prev));
  }, []);

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
