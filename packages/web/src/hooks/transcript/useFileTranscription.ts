import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/livestore/store";
import { write as opfsWrite } from "@memora/fs";

import type { FileType, RecordingMeta, RecordingTranscript } from "@/types/library";
import { TRANSCRIPT_SUFFIX, FILES_DIR } from "@/types/library";
import { resolveAudioBlob } from "@/lib/library/fileStorage";
import {
  TRANSCRIPT_LANGUAGE_STORAGE_KEY,
  evaluateTranscriptCandidate,
} from "@/lib/transcript/transcriptUtils";
import type { WhisperProgressItem } from "@/lib/transcript/whisper/client";
import {
  readTranscriptionRuntime,
  type TranscriptionRuntime,
} from "@/lib/models/transcriptionRuntime";
import { transcribePcm } from "@/lib/transcript/providers/transcribePcm";
import { toRecordingTranscript } from "@/lib/transcript/providers/toRecordingTranscript";
import { fileEvents } from "@/livestore/file";

type TranscriptionStatus =
  | "idle"
  | "loading-model"
  | "decoding"
  | "transcribing"
  | "saving"
  | "complete"
  | "error";

export type FileTranscriptionRuntime = TranscriptionRuntime;

// A caller can supply an explicitly selected provider. There is no cloud fallback.
export const useFileTranscription = (runtime?: FileTranscriptionRuntime) => {
  const store = useAppStore();
  const activeRun = useRef<AbortController | null>(null);

  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [progressItems, setProgressItems] = useState<WhisperProgressItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const getLanguage = useCallback(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY) ?? "en";
  }, []);

  const decodeAudioBufferToFloat32 = useCallback(async (audioBuffer: AudioBuffer) => {
    // Convert to mono Float32Array at 16kHz
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const output = new Float32Array(length);

    if (numberOfChannels === 1) {
      audioBuffer.copyFromChannel(output, 0);
      return output;
    }

    const channels: Float32Array[] = [];
    for (let i = 0; i < numberOfChannels; i++) {
      const channelData = new Float32Array(length);
      audioBuffer.copyFromChannel(channelData, i);
      channels.push(channelData);
    }
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (const channel of channels) {
        sum += channel[i];
      }
      output[i] = sum / numberOfChannels;
    }

    return output;
  }, []);

  const decodeWithAudioContext = useCallback(
    async (blob: Blob) => {
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 16000 });
      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return await decodeAudioBufferToFloat32(audioBuffer);
      } finally {
        await audioContext.close();
      }
    },
    [decodeAudioBufferToFloat32],
  );

  const decodeVideoWithMediaElement = useCallback(
    async (blob: Blob) => {
      if (typeof document === "undefined") {
        throw new Error("Video decoding is not available in this environment.");
      }

      const videoUrl = URL.createObjectURL(blob);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = videoUrl;

      try {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => resolve();
          const onError = () => reject(new Error("Unable to load video metadata."));
          video.addEventListener("loadedmetadata", onLoaded, { once: true });
          video.addEventListener("error", onError, { once: true });
        });

        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (duration <= 0) {
          throw new Error("Video has no audio track or duration could not be read.");
        }

        const sampleRate = 16000;
        const frameCount = Math.ceil(duration * sampleRate);
        const offlineContext = new OfflineAudioContext(1, frameCount, sampleRate);
        const source = (offlineContext as unknown as AudioContext).createMediaElementSource(video);
        source.connect(offlineContext.destination);

        try {
          await video.play();
        } catch {
          throw new Error("Video playback was blocked. Click play then retry.");
        }

        const rendered = await offlineContext.startRendering();
        video.pause();
        source.disconnect();

        return await decodeAudioBufferToFloat32(rendered);
      } finally {
        URL.revokeObjectURL(videoUrl);
        video.src = "";
      }
    },
    [decodeAudioBufferToFloat32],
  );

  const decodeAudioToFloat32 = useCallback(
    async (blob: Blob, fileType?: FileType): Promise<Float32Array> => {
      try {
        return await decodeWithAudioContext(blob);
      } catch (error) {
        const shouldTryVideo = fileType === "video" || blob.type.toLowerCase().startsWith("video/");
        if (!shouldTryVideo) {
          throw error;
        }
        return await decodeVideoWithMediaElement(blob);
      }
    },
    [decodeWithAudioContext, decodeVideoWithMediaElement],
  );

  const saveTranscript = useCallback(
    async (meta: RecordingMeta, transcript: RecordingTranscript): Promise<void> => {
      const transcriptPath = `${FILES_DIR}/${meta.id}/${meta.id}${TRANSCRIPT_SUFFIX}`;

      // Save transcript JSON
      await opfsWrite(transcriptPath, JSON.stringify(transcript), {
        overwrite: true,
      });

      // Update meta file with transcriptPath
      const updatedMeta: RecordingMeta = {
        ...meta,
        transcriptPath,
        transcriptPreview: transcript.text?.slice(0, 280) ?? null,
        updatedAt: Date.now(),
      };
      // Remove runtime properties that shouldn't be persisted
      const metaToSave = { ...updatedMeta };
      delete (metaToSave as Record<string, unknown>).audioUrl;
      delete (metaToSave as Record<string, unknown>).transcript;

      await opfsWrite(meta.metaPath, JSON.stringify(metaToSave), {
        overwrite: true,
      });

      // Update livestore
      store.commit(
        fileEvents.fileTranscribed({
          id: meta.id,
          transcriptPath,
          updatedAt: new Date(),
        }),
      );
    },
    [store],
  );

  const transcribeFile = useCallback(
    async (meta: RecordingMeta): Promise<RecordingTranscript> => {
      if (activeRun.current) throw new Error("A transcription is already running.");
      const controller = new AbortController();
      activeRun.current = controller;
      setStatus("decoding");
      setProgress(0);
      setProgressItems([]);
      setError(null);

      try {
        // Snapshot the selection for the whole file, even if settings change mid-run.
        const selected = runtime ?? readTranscriptionRuntime(store);
        const blob = await resolveAudioBlob(meta);
        controller.signal.throwIfAborted();
        if (!blob) throw new Error("Audio file not found");
        setProgress(10);
        const audioData = await decodeAudioToFloat32(blob, meta.type);
        controller.signal.throwIfAborted();
        setProgress(20);
        setStatus("transcribing");
        const segments = await transcribePcm(
          selected.provider,
          audioData,
          {
            modelId: selected.modelId,
            sampleRate: 16000,
            language: getLanguage(),
            timestamps: selected.timestamps,
            signal: controller.signal,
          },
          (value) => {
            if (!controller.signal.aborted) setProgress(20 + value * 65);
          },
          (event) => {
            if (controller.signal.aborted) return;
            if (event.type === "segment") {
              setStatus("transcribing");
              setProgressItems([]);
            } else if (event.type === "progress") {
              setStatus("loading-model");
              setProgressItems((items) => {
                const remaining = items.filter((item) => item.file !== event.label);
                return event.progress !== undefined && event.progress >= 100
                  ? remaining
                  : [...remaining, { file: event.label, progress: event.progress ?? 0 }];
              });
            }
          },
        );
        controller.signal.throwIfAborted();
        const rawTranscript = toRecordingTranscript(segments);
        // Preserve Whisper's existing hallucination checks; do not apply its
        // heuristics to providers that do not return word timestamps.
        let transcript: RecordingTranscript = rawTranscript;
        if (selected.provider.adapterId === "whisper-local") {
          const evaluation = evaluateTranscriptCandidate({
            audio: audioData,
            text: rawTranscript.text,
            words: rawTranscript.words,
          });
          transcript = {
            text: evaluation.text,
            words: evaluation.words,
            diagnostics: evaluation.diagnostics,
          };
        }
        setStatus("saving");
        setProgress(90);
        await saveTranscript(meta, transcript);
        controller.signal.throwIfAborted();
        setStatus("complete");
        setProgress(100);
        return transcript;
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Transcription failed");
          setStatus("error");
        }
        throw err;
      } finally {
        if (activeRun.current === controller) activeRun.current = null;
      }
    },
    [decodeAudioToFloat32, getLanguage, runtime, saveTranscript, store],
  );

  const reset = useCallback(() => {
    activeRun.current?.abort();
    activeRun.current = null;
    setStatus("idle");
    setProgress(0);
    setError(null);
    setProgressItems([]);
  }, []);

  useEffect(() => {
    return () => {
      activeRun.current?.abort();
      activeRun.current = null;
    };
  }, []);

  return {
    transcribeFile,
    status,
    progress,
    progressItems,
    error,
    reset,
  };
};
