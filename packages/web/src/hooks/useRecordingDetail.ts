import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let audioUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const metas = await listRecordings();
        const meta = metas.find((item) => item.id === id);
        if (!meta) {
          throw new Error("Recording not found");
        }

        audioUrl = await getRecordingAudioUrl(meta);
        const transcript = meta.transcriptPath ? await getRecordingTranscript(meta) : null;

        if (!cancelled) {
          setRecording({ ...meta, audioUrl, transcript });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load recording");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [id]);

  return { recording, loading, error };
};
