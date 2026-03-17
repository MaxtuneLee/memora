import { useCallback, useEffect, useRef, useState } from "react";

import type { RecordingItem } from "@/types/library";
import {
  getRecordingAudioUrl,
  getRecordingTranscript,
  listRecordings,
} from "@/lib/library/fileService";

export const useRecordingDetail = (id: string | undefined) => {
  const [recording, setRecording] = useState<RecordingItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const revokeAudioUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    URL.revokeObjectURL(url);
  }, []);

  const load = useCallback(async (recordingId: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const metas = await listRecordings();
      const meta = metas.find((item) => item.id === recordingId);
      if (!meta) {
        throw new Error("Recording not found");
      }

      const audioUrl = await getRecordingAudioUrl(meta);
      if (requestId !== requestIdRef.current) {
        revokeAudioUrl(audioUrl);
        return;
      }

      const transcript = meta.transcriptPath
        ? await getRecordingTranscript(meta)
        : null;
      if (requestId !== requestIdRef.current) {
        revokeAudioUrl(audioUrl);
        return;
      }

      const previousAudioUrl = audioUrlRef.current;
      audioUrlRef.current = audioUrl;

      setRecording({ ...meta, audioUrl: audioUrl ?? undefined, transcript });
      if (previousAudioUrl && previousAudioUrl !== audioUrl) {
        window.setTimeout(() => {
          if (audioUrlRef.current !== previousAudioUrl) {
            revokeAudioUrl(previousAudioUrl);
          }
        }, 0);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load recording");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [revokeAudioUrl]);

  const reload = useCallback(() => {
    if (id) {
      void load(id);
    }
  }, [id, load]);

  useEffect(() => {
    if (!id) {
      requestIdRef.current += 1;
      setRecording(null);
      setLoading(false);
      setError(null);
      return;
    }

    void load(id);

    return () => {
      requestIdRef.current += 1;
    };
  }, [id, load]);

  useEffect(() => {
    return () => {
      revokeAudioUrl(audioUrlRef.current);
      audioUrlRef.current = null;
    };
  }, [revokeAudioUrl]);

  return { recording, loading, error, reload };
};
