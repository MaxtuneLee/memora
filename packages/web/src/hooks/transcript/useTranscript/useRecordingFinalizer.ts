import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { saveRecording } from "@/lib/library/fileService";
import {
  DEFAULT_AUDIO_MIME,
  type RecordingWord,
  type TranscriptDiagnostics,
} from "@/types/library";
import { fileEvents } from "@/livestore/file";
import { summarizeTranscriptDiagnostics } from "@/lib/transcript/transcriptUtils";

type StoreLike = {
  commit: (...events: unknown[]) => void;
};

export const useRecordingFinalizer = ({
  store,
  mediaRecorderRef,
  mediaChunksRef,
  recordingIdRef,
  recordingStartRef,
  recordingTextRef,
  recordingWordsRef,
  segmentDiagnosticsRef,
  setSaveStatus,
  setLastSavedId,
}: {
  store: StoreLike;
  mediaRecorderRef: MutableRefObject<MediaRecorder | null>;
  mediaChunksRef: MutableRefObject<Blob[]>;
  recordingIdRef: MutableRefObject<string | null>;
  recordingStartRef: MutableRefObject<number | null>;
  recordingTextRef: MutableRefObject<string>;
  recordingWordsRef: MutableRefObject<RecordingWord[]>;
  segmentDiagnosticsRef: MutableRefObject<TranscriptDiagnostics[]>;
  setSaveStatus: Dispatch<SetStateAction<"idle" | "saving" | "success">>;
  setLastSavedId: Dispatch<SetStateAction<string | null>>;
}) => {
  const pendingSaveRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const finalizeRef = useRef<() => Promise<void>>(async () => {});

  const maybeFinalizeRecording = useCallback(async () => {
    if (!pendingSaveRef.current || saveInProgressRef.current) {
      return;
    }

    const id = recordingIdRef.current;
    if (!id) {
      return;
    }

    saveInProgressRef.current = true;
    setSaveStatus("saving");
    setLastSavedId(null);
    saveChainRef.current = saveChainRef.current
      .then(async () => {
        const durationSec = recordingStartRef.current
          ? (performance.now() - recordingStartRef.current) / 1000
          : 0;
        const mimeType = mediaRecorderRef.current?.mimeType || DEFAULT_AUDIO_MIME;
        const blob = new Blob(mediaChunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          pendingSaveRef.current = false;
          setSaveStatus("idle");
          return;
        }

        const createdAt = Date.now();
        const transcriptDiagnostics = summarizeTranscriptDiagnostics({
          text: recordingTextRef.current,
          segments: segmentDiagnosticsRef.current,
        });
        const result = await saveRecording({
          id,
          blob,
          name: `Recording ${new Date(createdAt).toLocaleString()}`,
          type: "audio",
          mimeType,
          durationSec,
          transcriptText: recordingTextRef.current,
          transcriptWords: recordingWordsRef.current,
          transcriptDiagnostics,
          createdAt,
        });

        const createdAtDate = new Date(result.meta.createdAt);
        const events = [
          fileEvents.fileCreated({
            id: result.id,
            name: result.meta.name,
            type: result.meta.type,
            mimeType: result.meta.mimeType,
            sizeBytes: result.meta.sizeBytes,
            storageType: result.meta.storageType,
            storagePath: result.meta.storagePath,
            parentId: result.meta.parentId ?? null,
            positionX: result.meta.positionX ?? null,
            positionY: result.meta.positionY ?? null,
            durationSec: result.meta.durationSec ?? undefined,
            createdAt: createdAtDate,
          }),
          fileEvents.fileTranscribed({
            id: result.id,
            transcriptPath: result.meta.transcriptPath ?? "",
            updatedAt: createdAtDate,
          }),
        ];
        if (result.meta.transcriptPath) {
          events.push(
            fileEvents.fileTranscribed({
              id: result.id,
              transcriptPath: result.meta.transcriptPath,
              updatedAt: createdAtDate,
            }),
          );
        }
        store.commit(...events);

        pendingSaveRef.current = false;
        mediaChunksRef.current = [];
        recordingIdRef.current = null;
        recordingStartRef.current = null;
        setSaveStatus("success");
        setLastSavedId(result.id);
        setTimeout(() => {
          setSaveStatus("idle");
        }, 1500);
      })
      .finally(() => {
        saveInProgressRef.current = false;
        if (pendingSaveRef.current) {
          void finalizeRef.current();
        }
      });
  }, [
    mediaChunksRef,
    mediaRecorderRef,
    recordingIdRef,
    recordingStartRef,
    recordingTextRef,
    recordingWordsRef,
    segmentDiagnosticsRef,
    setLastSavedId,
    setSaveStatus,
    store,
  ]);

  useEffect(() => {
    finalizeRef.current = maybeFinalizeRecording;
  }, [maybeFinalizeRecording]);

  return {
    pendingSaveRef,
    maybeFinalizeRecording,
  };
};
