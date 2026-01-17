import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { saveRecording } from "../lib/fileService";
import { DEFAULT_AUDIO_MIME, type RecordingWord } from "../lib/files";
import {
  TRANSFORMERS_CACHE_DIR,
  TRANSCRIPT_LANGUAGE_STORAGE_KEY,
  WHISPER_MAX_SAMPLES,
  WHISPER_SAMPLE_RATE,
  buildWordAnimationWords,
  isUsableText,
} from "../lib/transcriptUtils";
import { dir as opfsDir } from "opfs-tools";

interface ProgressItem {
  file: string;
  progress: number;
  total?: number;
}

export const useTranscript = () => {
  const worker = useRef<Worker | null>(null);
  const pendingSegmentsRef = useRef<
    Array<{ audio: Float32Array; startSec: number }>
  >([]);
  const currentSegmentRef = useRef<{ startSec: number } | null>(null);
  const recordingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY) ?? "en";
  });
  const languageRef = useRef(language);
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  const vadInitializingRef = useRef(false);
  const collectingRef = useRef(false);
  const speechBufferRef = useRef<Float32Array[]>([]);
  const speechBufferSizeRef = useRef(0);
  const wordAnimationQueueRef = useRef<
    Array<{
      words: Array<{ text: string; delayMs: number }>;
      finalText: string;
    }>
  >([]);
  const wordAnimationRunningRef = useRef(false);
  const wordAnimationTimeoutRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const recordingTextRef = useRef("");
  const recordingWordsRef = useRef<RecordingWord[]>([]);
  const speechStartTimeRef = useRef<number | null>(null);
  const speechStartSecRef = useRef<number | null>(null);
  const speechBufferOffsetSecRef = useRef(0);
  const pendingSaveRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const [status, setStatus] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isModelCached, setIsModelCached] = useState(false);
  const [isCheckingCache, setIsCheckingCache] = useState(true);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [accumulatedText, setAccumulatedText] = useState("");
  const [currentSegment, setCurrentSegment] = useState("");
  const [tps, setTps] = useState<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">(
    "idle"
  );
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  const isWebGpuAvailable = !!(navigator.gpu && "GPUBufferUsage" in window);

  const getOrCreateStream = useCallback(async () => {
    if (streamRef.current) {
      const hasLiveTrack = streamRef.current
        .getTracks()
        .some((track) => track.readyState === "live");
      if (hasLiveTrack) return streamRef.current;
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    streamRef.current = mediaStream;
    setStream(mediaStream);
    return mediaStream;
  }, []);

  const tryProcessNext = useCallback(() => {
    if (isProcessingRef.current) return;
    const next = pendingSegmentsRef.current.shift();
    if (!next) return;

    isProcessingRef.current = true;
    currentSegmentRef.current = { startSec: next.startSec };
    worker.current?.postMessage({
      type: "generate",
      data: { audio: next.audio, language: languageRef.current },
    });
  }, []);

  const enqueueSpeech = useCallback(
    (audio: Float32Array, startSec: number) => {
      if (audio.length <= WHISPER_MAX_SAMPLES) {
        pendingSegmentsRef.current.push({ audio, startSec });
        tryProcessNext();
        return;
      }

      for (
        let offset = 0;
        offset < audio.length;
        offset += WHISPER_MAX_SAMPLES
      ) {
        const chunk = audio.subarray(offset, offset + WHISPER_MAX_SAMPLES);
        const chunkStartSec = startSec + offset / WHISPER_SAMPLE_RATE;
        pendingSegmentsRef.current.push({
          audio: chunk,
          startSec: chunkStartSec,
        });
      }
      tryProcessNext();
    },
    [tryProcessNext]
  );

  const clearWordAnimations = useCallback(() => {
    if (wordAnimationTimeoutRef.current !== null) {
      window.clearTimeout(wordAnimationTimeoutRef.current);
      wordAnimationTimeoutRef.current = null;
    }
    wordAnimationQueueRef.current = [];
    wordAnimationRunningRef.current = false;
  }, []);

  const enqueueWordAnimation = useCallback(
    (
      chunks: Array<{ text: string; timestamp?: [number, number] }>,
      finalText: string
    ) => {
      const words = buildWordAnimationWords(chunks);
      if (words.length === 0) return;

      wordAnimationQueueRef.current.push({ words, finalText });
      if (wordAnimationRunningRef.current) return;

      const runNext = () => {
        const job = wordAnimationQueueRef.current.shift();
        if (!job) {
          wordAnimationRunningRef.current = false;
          return;
        }

        wordAnimationRunningRef.current = true;
        setCurrentSegment("");

        let index = 0;
        const step = () => {
          if (index >= job.words.length) {
            wordAnimationRunningRef.current = false;
            setCurrentSegment("");
            setAccumulatedText((prev) =>
              prev ? `${prev} ${job.finalText.trim()}` : job.finalText.trim()
            );
            runNext();
            return;
          }

          const word = job.words[index];
          setCurrentSegment((prev) => `${prev}${word.text}`);
          index += 1;
          wordAnimationTimeoutRef.current = window.setTimeout(
            step,
            word.delayMs
          );
        };

        step();
      };

      runNext();
    },
    []
  );

  const consumeSpeechBuffer = useCallback((count: number) => {
    const output = new Float32Array(count);
    let offset = 0;

    while (offset < count && speechBufferRef.current.length > 0) {
      const chunk = speechBufferRef.current[0];
      const remaining = count - offset;

      if (chunk.length <= remaining) {
        output.set(chunk, offset);
        offset += chunk.length;
        speechBufferRef.current.shift();
      } else {
        output.set(chunk.subarray(0, remaining), offset);
        speechBufferRef.current[0] = chunk.subarray(remaining);
        offset += remaining;
      }
    }

    return output;
  }, []);

  const appendSpeechFrame = useCallback(
    (frame: Float32Array) => {
      speechBufferRef.current.push(frame);
      speechBufferSizeRef.current += frame.length;

      while (speechBufferSizeRef.current >= WHISPER_MAX_SAMPLES) {
        const chunk = consumeSpeechBuffer(WHISPER_MAX_SAMPLES);
        speechBufferSizeRef.current -= WHISPER_MAX_SAMPLES;
        if (speechStartSecRef.current != null) {
          const chunkStartSec =
            speechStartSecRef.current + speechBufferOffsetSecRef.current;
          enqueueSpeech(chunk, chunkStartSec);
          speechBufferOffsetSecRef.current +=
            chunk.length / WHISPER_SAMPLE_RATE;
        }
      }
    },
    [consumeSpeechBuffer, enqueueSpeech]
  );

  const flushSpeechBuffer = useCallback(() => {
    if (speechBufferSizeRef.current === 0) return;
    const chunk = consumeSpeechBuffer(speechBufferSizeRef.current);
    speechBufferSizeRef.current = 0;
    if (speechStartSecRef.current != null) {
      const chunkStartSec =
        speechStartSecRef.current + speechBufferOffsetSecRef.current;
      enqueueSpeech(chunk, chunkStartSec);
      speechBufferOffsetSecRef.current += chunk.length / WHISPER_SAMPLE_RATE;
    }
  }, [consumeSpeechBuffer, enqueueSpeech]);

  const maybeFinalizeRecording = useCallback(async () => {
    if (!pendingSaveRef.current) return;
    if (isProcessingRef.current) return;
    if (pendingSegmentsRef.current.length > 0) return;
    if (saveInProgressRef.current) return;

    const id = recordingIdRef.current;
    if (!id) return;

    saveInProgressRef.current = true;
    setSaveStatus("saving");
    setLastSavedId(null);
    saveChainRef.current = saveChainRef.current
      .then(async () => {
        const durationSec = recordingStartRef.current
          ? (performance.now() - recordingStartRef.current) / 1000
          : 0;

        const mimeType =
          mediaRecorderRef.current?.mimeType || DEFAULT_AUDIO_MIME;
        const blob = new Blob(mediaChunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          pendingSaveRef.current = false;
          setSaveStatus("idle");
          return;
        }

        const createdAt = Date.now();
        const result = await saveRecording({
          id,
          blob,
          name: `Recording ${new Date(createdAt).toLocaleString()}`,
          type: "audio",
          mimeType,
          durationSec,
          transcriptText: recordingTextRef.current,
          transcriptWords: recordingWordsRef.current,
          createdAt,
        });

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
          void maybeFinalizeRecording();
        }
      });
  }, []);

  const ensureVAD = useCallback(async () => {
    if (vadRef.current || vadInitializingRef.current) return;
    vadInitializingRef.current = true;
    try {
      vadRef.current = await MicVAD.new({
        baseAssetPath: "/",
        onnxWASMBasePath: "/",
        submitUserSpeechOnPause: true,
        getStream: getOrCreateStream,
        pauseStream: async () => {
          // keep stream alive for the visualizer
        },
        resumeStream: async () => getOrCreateStream(),
        onFrameProcessed: (_probabilities, frame) => {
          if (!recordingRef.current || !collectingRef.current) return;
          appendSpeechFrame(frame);
        },
        onSpeechStart: () => {
          if (!recordingRef.current) return;
          collectingRef.current = true;
          speechBufferRef.current = [];
          speechBufferSizeRef.current = 0;
          speechBufferOffsetSecRef.current = 0;
          if (recordingStartRef.current) {
            const now = performance.now();
            speechStartTimeRef.current = now;
            speechStartSecRef.current =
              (now - recordingStartRef.current) / 1000;
          }
        },
        onVADMisfire: () => {
          if (!recordingRef.current) return;
          collectingRef.current = false;
          speechBufferRef.current = [];
          speechBufferSizeRef.current = 0;
          speechBufferOffsetSecRef.current = 0;
          speechStartTimeRef.current = null;
          speechStartSecRef.current = null;
        },
        onSpeechEnd: (audio) => {
          if (!recordingRef.current) return;
          if (!audio || audio.length === 0) return;
          collectingRef.current = false;
          const startSec =
            speechStartSecRef.current ??
            (recordingStartRef.current
              ? (performance.now() - recordingStartRef.current) / 1000
              : 0);
          if (speechBufferSizeRef.current === 0) {
            enqueueSpeech(audio, startSec);
          } else {
            flushSpeechBuffer();
          }
          speechStartTimeRef.current = null;
          speechStartSecRef.current = null;
        },
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        redemptionMs: 800,
      });
    } finally {
      vadInitializingRef.current = false;
    }
  }, [appendSpeechFrame, enqueueSpeech, flushSpeechBuffer, getOrCreateStream]);

  const loadModel = useCallback(() => {
    worker.current?.postMessage({ type: "load" });
    setStatus("loading");
  }, []);

  const checkModelCache = useCallback(async () => {
    setIsCheckingCache(true);
    try {
      const cacheRoot = opfsDir(TRANSFORMERS_CACHE_DIR);
      const exists = await cacheRoot.exists();
      if (!exists) {
        setIsModelCached(false);
        return false;
      }
      const hasAnyFiles = async (path: string): Promise<boolean> => {
        const children = await opfsDir(path).children();
        for (const child of children) {
          if (child.kind === "file") return true;
          if (child.kind === "dir") {
            const nested = await hasAnyFiles(child.path);
            if (nested) return true;
          }
        }
        return false;
      };
      const hasFiles = await hasAnyFiles(TRANSFORMERS_CACHE_DIR);
      setIsModelCached(hasFiles);
      return hasFiles;
    } catch {
      setIsModelCached(false);
      return false;
    } finally {
      setIsCheckingCache(false);
    }
  }, []);

  const updateLanguage = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    languageRef.current = trimmed;
    setLanguage(trimmed);
    if (typeof window !== "undefined") {
      localStorage.setItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY, trimmed);
    }
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (status !== "ready") return;
    const mediaStream = await getOrCreateStream();
    await ensureVAD();
    setRecording(true);
    setPaused(false);
    recordingRef.current = true;
    pendingSegmentsRef.current = [];
    recordingTextRef.current = "";
    recordingWordsRef.current = [];
    recordingIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `rec-${Date.now()}`;
    recordingStartRef.current = performance.now();
    pendingSaveRef.current = false;
    mediaChunksRef.current = [];

    const mimeCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
    const mimeType = mimeCandidates.find((type) =>
      MediaRecorder.isTypeSupported(type)
    );

    const recorder = new MediaRecorder(mediaStream, {
      mimeType: mimeType || undefined,
    });
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        mediaChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      pendingSaveRef.current = true;
      maybeFinalizeRecording();
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);

    vadRef.current?.start();
  }, [ensureVAD, getOrCreateStream, maybeFinalizeRecording, status]);

  const handlePauseRecording = useCallback(() => {
    if (!recordingRef.current || paused) return;
    setPaused(true);
    collectingRef.current = false;
    speechBufferRef.current = [];
    speechBufferSizeRef.current = 0;
    speechBufferOffsetSecRef.current = 0;
    speechStartTimeRef.current = null;
    speechStartSecRef.current = null;
    vadRef.current?.pause();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
    }
  }, [paused]);

  const handleResumeRecording = useCallback(() => {
    if (!recordingRef.current || !paused) return;
    setPaused(false);
    vadRef.current?.start();
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
    }
  }, [paused]);

  const handleFinalizeRecording = useCallback(() => {
    if (!recordingRef.current) return;
    setRecording(false);
    setPaused(false);
    recordingRef.current = false;
    pendingSaveRef.current = true;
    collectingRef.current = false;
    speechBufferRef.current = [];
    speechBufferSizeRef.current = 0;
    speechBufferOffsetSecRef.current = 0;
    speechStartTimeRef.current = null;
    speechStartSecRef.current = null;
    clearWordAnimations();
    vadRef.current?.pause();
    if (
      mediaRecorderRef.current?.state === "recording" ||
      mediaRecorderRef.current?.state === "paused"
    ) {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
    maybeFinalizeRecording();
  }, [clearWordAnimations, maybeFinalizeRecording]);

  const handleStopRecording = useCallback(() => {
    setRecording(false);
    recordingRef.current = false;
    setPaused(false);
    pendingSaveRef.current = true;
    collectingRef.current = false;
    speechBufferRef.current = [];
    speechBufferSizeRef.current = 0;
    speechBufferOffsetSecRef.current = 0;
    speechStartTimeRef.current = null;
    speechStartSecRef.current = null;
    clearWordAnimations();
    vadRef.current?.pause();
    if (
      mediaRecorderRef.current?.state === "recording" ||
      mediaRecorderRef.current?.state === "paused"
    ) {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
  }, [clearWordAnimations]);

  const handleReset = useCallback(() => {
    setAccumulatedText("");
    setCurrentSegment("");
    pendingSegmentsRef.current = [];
    collectingRef.current = false;
    speechBufferRef.current = [];
    speechBufferSizeRef.current = 0;
    speechBufferOffsetSecRef.current = 0;
    speechStartTimeRef.current = null;
    speechStartSecRef.current = null;
    clearWordAnimations();
  }, [clearWordAnimations]);

  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(
        new URL("../workers/whisper.worker.ts", import.meta.url),
        {
          type: "module",
        }
      );
    }

    const onMessageReceived = (e: MessageEvent) => {
      switch (e.data.status) {
        case "loading":
          setStatus("loading");
          setLoadingMessage(e.data.data);
          break;
        case "initiate":
          setProgressItems((prev) => [...prev, e.data]);
          break;
        case "progress":
          setProgressItems((prev) =>
            prev.map((item) => {
              if (item.file === e.data.file) {
                return { ...item, ...e.data };
              }
              return item;
            })
          );
          break;
        case "done":
          setProgressItems((prev) =>
            prev.filter((item) => item.file !== e.data.file)
          );
          break;
        case "ready":
          setStatus("ready");
          setIsModelCached(true);
          setIsCheckingCache(false);
          break;
        case "start":
          isProcessingRef.current = true;
          setCurrentSegment("");
          setTps(null);
          break;
        case "update":
          setCurrentSegment(e.data.output);
          setTps(e.data.tps);
          break;
        case "complete": {
          isProcessingRef.current = false;
          const newText =
            typeof e.data.output === "string"
              ? e.data.output
              : Array.isArray(e.data.output)
                ? e.data.output[0]
                : "";
          const chunks = Array.isArray(e.data.chunks)
            ? (e.data.chunks as RecordingWord[])
            : [];
          const offsetSec = currentSegmentRef.current?.startSec ?? 0;
          const adjustedChunks: RecordingWord[] = chunks
            .filter((chunk) => Array.isArray(chunk.timestamp))
            .map((chunk) => ({
              text: chunk.text,
              timestamp: [
                chunk.timestamp[0] + offsetSec,
                chunk.timestamp[1] + offsetSec,
              ],
            }));
          const shouldUseText = isUsableText(newText);

          if (shouldUseText && chunks.length > 0) {
            enqueueWordAnimation(chunks, newText);
          } else if (shouldUseText) {
            setAccumulatedText((prev) =>
              prev ? `${prev} ${newText.trim()}` : newText.trim()
            );
          }

          if (recordingIdRef.current && shouldUseText) {
            recordingTextRef.current = recordingTextRef.current
              ? `${recordingTextRef.current} ${newText.trim()}`
              : newText.trim();
          }
          if (recordingIdRef.current && adjustedChunks.length > 0) {
            recordingWordsRef.current.push(...adjustedChunks);
          }
          setCurrentSegment("");
          tryProcessNext();
          maybeFinalizeRecording();
          break;
        }
      }
    };

    worker.current.addEventListener("message", onMessageReceived);
    return () => {
      worker.current?.removeEventListener("message", onMessageReceived);
      worker.current?.terminate();
      worker.current = null;
    };
  }, [enqueueWordAnimation, maybeFinalizeRecording, tryProcessNext]);

  useEffect(() => {
    return () => {
      vadRef.current?.destroy();
      vadRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      clearWordAnimations();
    };
  }, [clearWordAnimations]);

  return {
    isWebGpuAvailable,
    status,
    loadingMessage,
    progressItems,
    accumulatedText,
    currentSegment,
    tps,
    stream,
    recording,
    paused,
    saveStatus,
    lastSavedId,
    language,
    isModelCached,
    isCheckingCache,
    loadModel,
    updateLanguage,
    checkModelCache,
    handleStartRecording,
    handlePauseRecording,
    handleResumeRecording,
    handleFinalizeRecording,
    handleStopRecording,
    handleReset,
  };
};
