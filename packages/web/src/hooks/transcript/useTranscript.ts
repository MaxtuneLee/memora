import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@livestore/react";
import { MicVAD } from "@ricky0123/vad-web";
import { dir as opfsDir } from "@memora/fs";
import {
  type RecordingWord,
  type TranscriptDiagnostics,
} from "@/types/library";
import {
  TRANSFORMERS_CACHE_DIR,
  TRANSCRIPT_LANGUAGE_STORAGE_KEY,
  evaluateTranscriptCandidate,
} from "@/lib/transcript/transcriptUtils";
import {
  getOrCreateWhisperWorker,
  loadWhisperModel,
  subscribeToWhisperWorker,
  type WhisperProgressItem,
} from "@/lib/transcript/whisper/client";
import { useRecordingFinalizer } from "@/hooks/transcript/useTranscript/useRecordingFinalizer";
import { useSpeechBuffer } from "@/hooks/transcript/useTranscript/useSpeechBuffer";
import { useSpeechQueue } from "@/hooks/transcript/useTranscript/useSpeechQueue";
import { useWordAnimation } from "@/hooks/transcript/useTranscript/useWordAnimation";

export const useTranscript = () => {
  const { store } = useStore();
  const worker = useRef<Worker | null>(null);
  const recordingRef = useRef(false);
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY) ?? "en";
  });
  const languageRef = useRef(language);
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  const vadInitializingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const recordingTextRef = useRef("");
  const recordingWordsRef = useRef<RecordingWord[]>([]);
  const accumulatedTextRef = useRef("");
  const segmentDiagnosticsRef = useRef<TranscriptDiagnostics[]>([]);

  const [status, setStatus] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isModelCached, setIsModelCached] = useState(false);
  const [isCheckingCache, setIsCheckingCache] = useState(true);
  const [progressItems, setProgressItems] = useState<WhisperProgressItem[]>([]);
  const [accumulatedText, setAccumulatedText] = useState("");
  const [currentSegmentPrefix, setCurrentSegmentPrefix] = useState("");
  const [currentSegment, setCurrentSegment] = useState("");
  const [lastSegmentDiagnostics, setLastSegmentDiagnostics] =
    useState<TranscriptDiagnostics | null>(null);
  const [tps, setTps] = useState<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">(
    "idle",
  );
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  const isWebGpuAvailable = !!(navigator.gpu && "GPUBufferUsage" in window);
  const {
    pendingSegmentsRef,
    currentSegmentRef,
    isProcessingRef,
    tryProcessNext,
    enqueueSpeech,
  } = useSpeechQueue({
    workerRef: worker,
    languageRef,
  });
  const {
    collectingRef,
    speechBufferSizeRef,
    speechStartTimeRef,
    speechStartSecRef,
    appendSpeechFrame,
    flushSpeechBuffer,
    resetSpeechCollection,
  } = useSpeechBuffer({
    enqueueSpeech,
  });
  const {
    clearWordAnimations,
    enqueueWordAnimation,
  } = useWordAnimation({
    accumulatedTextRef,
    setAccumulatedText,
    setCurrentSegmentPrefix,
    setCurrentSegment,
  });
  const {
    pendingSaveRef,
    maybeFinalizeRecording,
  } = useRecordingFinalizer({
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
  });
  const finalizeIfReady = useCallback(async () => {
    if (isProcessingRef.current) {
      return;
    }
    if (pendingSegmentsRef.current.length > 0) {
      return;
    }
    await maybeFinalizeRecording();
  }, [isProcessingRef, maybeFinalizeRecording, pendingSegmentsRef]);

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
          resetSpeechCollection();
          collectingRef.current = true;
          if (recordingStartRef.current) {
            const now = performance.now();
            speechStartTimeRef.current = now;
            speechStartSecRef.current =
              (now - recordingStartRef.current) / 1000;
          }
        },
        onVADMisfire: () => {
          if (!recordingRef.current) return;
          resetSpeechCollection();
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
        redemptionMs: 150,
      });
    } finally {
      vadInitializingRef.current = false;
    }
  }, [
    appendSpeechFrame,
    enqueueSpeech,
    flushSpeechBuffer,
    getOrCreateStream,
    resetSpeechCollection,
  ]);

  const loadModel = useCallback(() => {
    const whisperWorker = getOrCreateWhisperWorker(worker);
    loadWhisperModel(whisperWorker);
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
    currentSegmentRef.current = null;
    recordingTextRef.current = "";
    accumulatedTextRef.current = "";
    recordingWordsRef.current = [];
    segmentDiagnosticsRef.current = [];
    setLastSegmentDiagnostics(null);
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
      MediaRecorder.isTypeSupported(type),
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
      void finalizeIfReady();
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);

    vadRef.current?.start();
  }, [ensureVAD, finalizeIfReady, getOrCreateStream, status]);

  const handlePauseRecording = useCallback(() => {
    if (!recordingRef.current || paused) return;
    setPaused(true);
    resetSpeechCollection();
    vadRef.current?.pause();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
    }
  }, [paused, resetSpeechCollection]);

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
    resetSpeechCollection();
    clearWordAnimations();
    vadRef.current?.pause();
    if (
      mediaRecorderRef.current?.state === "recording" ||
      mediaRecorderRef.current?.state === "paused"
    ) {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
    void finalizeIfReady();
  }, [clearWordAnimations, finalizeIfReady, resetSpeechCollection]);

  const handleReset = useCallback(() => {
    setAccumulatedText("");
    setCurrentSegmentPrefix("");
    setCurrentSegment("");
    setLastSegmentDiagnostics(null);
    accumulatedTextRef.current = "";
    pendingSegmentsRef.current = [];
    currentSegmentRef.current = null;
    resetSpeechCollection();
    segmentDiagnosticsRef.current = [];
    clearWordAnimations();
  }, [clearWordAnimations, resetSpeechCollection]);

  useEffect(() => {
    const whisperWorker = getOrCreateWhisperWorker(worker);
    const unsubscribe = subscribeToWhisperWorker(whisperWorker, (message) => {
      switch (message.status) {
        case "loading":
          setStatus("loading");
          setLoadingMessage(message.data);
          break;
        case "initiate":
          setProgressItems((previous) => [...previous, message]);
          break;
        case "progress":
          setProgressItems((previous) =>
            previous.map((item) => {
              if (item.file === message.file) {
                return { ...item, ...message };
              }
              return item;
            }),
          );
          break;
        case "done":
          setProgressItems((previous) =>
            previous.filter((item) => item.file !== message.file),
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
          setCurrentSegment(message.output);
          setTps(message.tps ?? null);
          break;
        case "complete": {
          isProcessingRef.current = false;
          const newText =
            typeof message.output === "string"
              ? message.output
              : Array.isArray(message.output)
                ? message.output[0]
                : "";
          const chunks = Array.isArray(message.chunks) ? message.chunks : [];
          const segmentAudio = currentSegmentRef.current?.audio ?? new Float32Array();
          const evaluation = evaluateTranscriptCandidate({
            audio: segmentAudio,
            text: newText,
            words: chunks,
          });
          segmentDiagnosticsRef.current.push(evaluation.diagnostics);
          setLastSegmentDiagnostics(evaluation.diagnostics);
          const offsetSec = currentSegmentRef.current?.startSec ?? 0;
          const adjustedChunks: RecordingWord[] = evaluation.words.map((chunk) => ({
              text: chunk.text,
              timestamp: [
                chunk.timestamp[0] + offsetSec,
                chunk.timestamp[1] + offsetSec,
              ],
            }));
          currentSegmentRef.current = null;

          if (evaluation.shouldKeep && evaluation.words.length > 0) {
            enqueueWordAnimation(evaluation.words, evaluation.text);
          } else if (evaluation.shouldKeep) {
            setAccumulatedText((prev) => {
              const nextText = prev
                ? `${prev} ${evaluation.text.trim()}`
                : evaluation.text.trim();
              accumulatedTextRef.current = nextText;
              return nextText;
            });
          }

          if (recordingIdRef.current && evaluation.shouldKeep) {
            recordingTextRef.current = recordingTextRef.current
              ? `${recordingTextRef.current} ${evaluation.text.trim()}`
              : evaluation.text.trim();
          }
          if (recordingIdRef.current && adjustedChunks.length > 0) {
            recordingWordsRef.current.push(...adjustedChunks);
          }
          setCurrentSegment("");
          tryProcessNext();
          void finalizeIfReady();
          break;
        }
        case "error":
          isProcessingRef.current = false;
          currentSegmentRef.current = null;
          setCurrentSegment("");
          tryProcessNext();
          void finalizeIfReady();
          break;
      }
    });

    return () => {
      unsubscribe();
      worker.current?.terminate();
      worker.current = null;
    };
  }, [enqueueWordAnimation, finalizeIfReady, tryProcessNext]);

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
    currentSegmentPrefix,
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
    lastSegmentDiagnostics,
    loadModel,
    updateLanguage,
    checkModelCache,
    handleStartRecording,
    handlePauseRecording,
    handleResumeRecording,
    handleFinalizeRecording,
    handleReset,
  };
};
