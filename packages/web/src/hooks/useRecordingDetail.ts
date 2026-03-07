import { useCallback, useEffect, useRef, useState } from "react";

import type { RecordingItem } from "../lib/files";
import {
  getRecordingAudioUrl,
  getRecordingTranscript,
  listRecordings,
} from "../lib/fileService";

export const useRecordingDetail = (id: string | undefined) => {
  const [recording, setRecording] = useState<RecordingItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const reloadToken = useRef(0);

  const load = useCallback(async (recordingId: string) => {
    setLoading(true);
    setError(null);
    try {
      const metas = await listRecordings();
      const meta = metas.find((item) => item.id === recordingId);
      if (!meta) {
        throw new Error("Recording not found");
      }

      // Revoke old URL if exists
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      const audioUrl = await getRecordingAudioUrl(meta);
      audioUrlRef.current = audioUrl;
      const transcript = meta.transcriptPath
        ? await getRecordingTranscript(meta)
        : null;

      setRecording({ ...meta, audioUrl: audioUrl ?? undefined, transcript });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recording");
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    if (id) {
      reloadToken.current += 1;
      void load(id);
    }
  }, [id, load]);

  useEffect(() => {
    if (!id) return;
    void load(id);

    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [id, load]);

  return { recording, loading, error, reload };
};
