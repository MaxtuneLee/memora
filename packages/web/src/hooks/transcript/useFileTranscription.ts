import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@livestore/react";
import { write as opfsWrite } from "@memora/fs";

import type {
  FileType,
  RecordingMeta,
  RecordingTranscript,
} from "@/types/library";
import { TRANSCRIPT_SUFFIX, FILES_DIR } from "@/types/library";
import { resolveAudioBlob } from "@/lib/library/fileStorage";
import {
  TRANSCRIPT_LANGUAGE_STORAGE_KEY,
  evaluateTranscriptCandidate,
} from "@/lib/transcript/transcriptUtils";
import {
  generateWhisperTranscript,
  getOrCreateWhisperWorker,
  loadWhisperModel,
  subscribeToWhisperWorker,
  type WhisperProgressItem,
} from "@/lib/transcript/whisper/client";
import { fileEvents } from "@/livestore/file";

type TranscriptionStatus =
  | "idle"
  | "loading-model"
  | "decoding"
  | "transcribing"
  | "saving"
  | "complete"
  | "error";

export const useFileTranscription = () => {
  const { store } = useStore();
  const worker = useRef<Worker | null>(null);
  const pendingResolve = useRef<((result: RecordingTranscript) => void) | null>(null);
  const pendingReject = useRef<((error: Error) => void) | null>(null);

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

  const decodeWithAudioContext = useCallback(async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return await decodeAudioBufferToFloat32(audioBuffer);
    } finally {
      await audioContext.close();
    }
  }, [decodeAudioBufferToFloat32]);

  const decodeVideoWithMediaElement = useCallback(async (blob: Blob) => {
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
  }, [decodeAudioBufferToFloat32]);

  const decodeAudioToFloat32 = useCallback(
    async (blob: Blob, fileType?: FileType): Promise<Float32Array> => {
      try {
        return await decodeWithAudioContext(blob);
      } catch (error) {
        const shouldTryVideo =
          fileType === "video" || blob.type.toLowerCase().startsWith("video/");
        if (!shouldTryVideo) {
          throw error;
        }
        return await decodeVideoWithMediaElement(blob);
      }
    },
    [decodeWithAudioContext, decodeVideoWithMediaElement]
  );

  const saveTranscript = useCallback(
    async (
      meta: RecordingMeta,
      transcript: RecordingTranscript
    ): Promise<void> => {
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
        })
      );
    },
    [store]
  );

  const transcribeFile = useCallback(
    async (meta: RecordingMeta): Promise<RecordingTranscript> => {
      setStatus("decoding");
      setProgress(0);
      setError(null);

      try {
        // Load audio blob
        const blob = await resolveAudioBlob(meta);
        if (!blob) throw new Error("Audio file not found");
        setProgress(10);

        // Decode to Float32Array
        const audioData = await decodeAudioToFloat32(blob, meta.type);
        setProgress(20);

        setStatus("loading-model");
        const whisperWorker = getOrCreateWhisperWorker(worker);
        const language = getLanguage();

        return new Promise<RecordingTranscript>((resolve, reject) => {
          pendingResolve.current = resolve;
          pendingReject.current = reject;

          const unsubscribe = subscribeToWhisperWorker(whisperWorker, (message) => {
            switch (message.status) {
              case "loading":
                setStatus("loading-model");
                break;
              case "initiate":
                setProgressItems((prev) => [...prev, message]);
                break;
              case "progress":
                setProgressItems((prev) =>
                  prev.map((item) =>
                    item.file === message.file ? { ...item, ...message } : item
                  )
                );
                break;
              case "done":
                setProgressItems((prev) =>
                  prev.filter((item) => item.file !== message.file)
                );
                break;
              case "ready":
                setStatus("transcribing");
                setProgress(30);
                generateWhisperTranscript(whisperWorker, {
                  audio: audioData,
                  language,
                });
                break;
              case "start":
                setProgress(40);
                break;
              case "update":
                // Could show partial transcript here
                break;
              case "complete": {
                unsubscribe();

                const text =
                  typeof message.output === "string"
                    ? message.output
                    : Array.isArray(message.output)
                      ? message.output[0]
                      : "";
                const chunks = Array.isArray(message.chunks) ? message.chunks : [];
                const evaluation = evaluateTranscriptCandidate({
                  audio: audioData,
                  text,
                  words: chunks,
                });

                const transcript: RecordingTranscript = {
                  text: evaluation.text,
                  words: evaluation.words,
                  diagnostics: evaluation.diagnostics,
                };

                setStatus("saving");
                setProgress(90);

                saveTranscript(meta, transcript)
                  .then(() => {
                    setStatus("complete");
                    setProgress(100);
                    pendingResolve.current?.(transcript);
                  })
                  .catch((err) => {
                    setError(err.message);
                    setStatus("error");
                    pendingReject.current?.(err);
                  });
                break;
              }
              case "error":
                unsubscribe();
                setError(message.data);
                setStatus("error");
                pendingReject.current?.(new Error(message.data));
                break;
            }
          });

          loadWhisperModel(whisperWorker);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transcription failed";
        setError(message);
        setStatus("error");
        throw err;
      }
    },
    [decodeAudioToFloat32, getLanguage, saveTranscript]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setError(null);
    setProgressItems([]);
  }, []);

  useEffect(() => {
    return () => {
      worker.current?.terminate();
      worker.current = null;
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
