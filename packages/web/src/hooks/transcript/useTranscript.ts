import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { dir as opfsDir } from "@memora/fs";
import { isNemotronAsrModel } from "@memora/local-model-runtime";

import { useAppStore } from "@/livestore/store";
import { type RecordingWord, type TranscriptDiagnostics } from "@/types/library";
import {
  TRANSFORMERS_CACHE_DIR,
  TRANSCRIPT_LANGUAGE_STORAGE_KEY,
  evaluateTranscriptCandidate,
  splitConfirmedStreamingText,
} from "@/lib/transcript/transcriptUtils";
import {
  getOrCreateWhisperWorker,
  loadTranscriptionModel,
  subscribeToWhisperWorker,
  type WhisperProgressItem,
} from "@/lib/transcript/whisper/client";
import { useNemotronStreamCapture } from "@/hooks/transcript/useTranscript/useNemotronStreamCapture";
import { useRecordingFinalizer } from "@/hooks/transcript/useTranscript/useRecordingFinalizer";
import {
  chooseCompletedSpeechAudio,
  useSpeechBuffer,
} from "@/hooks/transcript/useTranscript/useSpeechBuffer";
import { useSpeechQueue } from "@/hooks/transcript/useTranscript/useSpeechQueue";
import { useWordAnimation } from "@/hooks/transcript/useTranscript/useWordAnimation";
import {
  readTranscriptionRuntime,
  type TranscriptionRuntime,
} from "@/lib/models/transcriptionRuntime";

export const useTranscript = () => {
  const store = useAppStore();
  const worker = useRef<Worker | null>(null);
  const runtimeRef = useRef<TranscriptionRuntime | null>(null);
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

  const [status, setStatusState] = useState<string | null>(null);
  const statusRef = useRef<string | null>(null);
  const setStatus = useCallback((next: string | null) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);
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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">("idle");
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  const isWebGpuAvailable = !!(navigator.gpu && "GPUBufferUsage" in window);
  const { pendingSegmentsRef, currentSegmentRef, isProcessingRef, tryProcessNext, enqueueSpeech } =
    useSpeechQueue({
      workerRef: worker,
      languageRef,
      runtimeRef,
    });
  const {
    collectingRef,
    speechBufferSizeRef,
    speechStartTimeRef,
    speechStartSecRef,
    appendSpeechFrame,
    drainSpeechBuffer,
    resetSpeechCollection,
  } = useSpeechBuffer({
    enqueueSpeech,
  });
  const {
    start: startNemotronCapture,
    stop: stopNemotronCapture,
    suspend: suspendNemotronCapture,
    resume: resumeNemotronCapture,
    stopAudioGraph: stopNemotronAudioGraph,
  } = useNemotronStreamCapture({
    workerRef: worker,
    runtimeRef,
    languageRef,
  });
  const { clearWordAnimations, enqueueWordAnimation } = useWordAnimation({
    accumulatedTextRef,
    setAccumulatedText,
    setCurrentSegmentPrefix,
    setCurrentSegment,
  });
  const { pendingSaveRef, maybeFinalizeRecording } = useRecordingFinalizer({
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
            speechStartSecRef.current = (now - recordingStartRef.current) / 1000;
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
          const completedAudio = chooseCompletedSpeechAudio({
            vadAudio: audio,
            bufferedAudio:
              speechBufferSizeRef.current > 0 ? drainSpeechBuffer() : new Float32Array(),
          });
          if (completedAudio.length > 0) {
            enqueueSpeech(completedAudio, startSec);
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
    drainSpeechBuffer,
    enqueueSpeech,
    getOrCreateStream,
    resetSpeechCollection,
  ]);

  const validateModelSelection = useCallback(() => {
    try {
      // Until the continuous cloud recording path is connected, reject that
      // selection explicitly instead of starting a different local model.
      return readTranscriptionRuntime(store);
    } catch (error) {
      setStatus("error");
      setLoadingMessage(
        error instanceof Error ? error.message : "Check the transcription model settings.",
      );
      throw error;
    }
  }, [store]);

  const loadModel = useCallback(() => {
    try {
      const runtime = validateModelSelection();
      runtimeRef.current = runtime;
      setLoadingMessage("");
      setStatus("loading");
      loadTranscriptionModel(getOrCreateWhisperWorker(worker), runtime);
    } catch {
      // The validation error is already exposed to the recording page.
    }
  }, [validateModelSelection]);

  const checkModelCache = useCallback(async () => {
    setIsCheckingCache(true);
    try {
      validateModelSelection();
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
  }, [validateModelSelection]);

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
    const runtime = validateModelSelection();
    runtimeRef.current = runtime;
    const isNemotron = isNemotronAsrModel(runtime.modelId);
    const mediaStream = await getOrCreateStream();
    if (!isNemotron) await ensureVAD();
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

    const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type));

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

    if (isNemotron) {
      await startNemotronCapture(mediaStream);
      return;
    }
    void vadRef.current?.start();
  }, [ensureVAD, getOrCreateStream, startNemotronCapture, status, validateModelSelection]);

  const handlePauseRecording = useCallback(() => {
    if (!recordingRef.current || paused) return;
    setPaused(true);
    if (isNemotronAsrModel(runtimeRef.current?.modelId)) {
      suspendNemotronCapture();
    } else {
      resetSpeechCollection();
      void vadRef.current?.pause();
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
    }
  }, [paused, resetSpeechCollection, suspendNemotronCapture]);

  const handleResumeRecording = useCallback(() => {
    if (!recordingRef.current || !paused) return;
    setPaused(false);
    if (isNemotronAsrModel(runtimeRef.current?.modelId)) {
      resumeNemotronCapture();
    } else {
      void vadRef.current?.start();
    }
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
    }
  }, [paused, resumeNemotronCapture]);

  const handleFinalizeRecording = useCallback(() => {
    if (!recordingRef.current) return;
    const isNemotron = isNemotronAsrModel(runtimeRef.current?.modelId);
    setRecording(false);
    setPaused(false);
    recordingRef.current = false;
    pendingSaveRef.current = true;
    resetSpeechCollection();
    clearWordAnimations();
    if (
      mediaRecorderRef.current?.state === "recording" ||
      mediaRecorderRef.current?.state === "paused"
    ) {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
    if (isNemotron) {
      // Wait for the closing write/finish to land before deciding the recording is
      // done, so we don't save it a beat before its transcript arrives.
      void stopNemotronCapture().then(() => finalizeIfReady());
    } else {
      void vadRef.current?.pause();
      void finalizeIfReady();
    }
  }, [clearWordAnimations, finalizeIfReady, resetSpeechCollection, stopNemotronCapture]);

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
          setProgressItems((previous) => previous.filter((item) => item.file !== message.file));
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
        case "update": {
          // Nemotron's RNN-T decoder never revises a word once it's emitted, so
          // everything up to the last word boundary is already final: commit it
          // straight to accumulatedText instead of leaving it in currentSegment,
          // where it would otherwise pile up as animated spans for the whole
          // recording and get replayed/torn down all at once at finalize time.
          // Whisper's per-utterance VAD updates skip this: their text still needs
          // the shouldKeep quality gate below before it's safe to commit.
          if (isNemotronAsrModel(runtimeRef.current?.modelId)) {
            const { confirmed, pending } = splitConfirmedStreamingText(message.output);
            setAccumulatedText(confirmed);
            accumulatedTextRef.current = confirmed;
            setCurrentSegmentPrefix(confirmed);
            setCurrentSegment(pending);
          } else {
            setCurrentSegment(message.output);
          }
          setTps(message.tps ?? null);
          break;
        }
        case "complete": {
          isProcessingRef.current = false;
          const newText =
            typeof message.output === "string"
              ? message.output
              : Array.isArray(message.output)
                ? message.output[0]
                : "";
          const chunks = Array.isArray(message.chunks) ? message.chunks : [];
          if (message.streaming) {
            const text = newText.trim();
            // The "update" handler above already streamed confirmed words into
            // accumulatedText live, word by word, as they were decoded. This final
            // pass just reconciles with the model's authoritative text/timestamps —
            // no need to replay the whole recording through the word-reveal
            // animation again, which is what caused the mass render/teardown at
            // save time.
            if (text) {
              setAccumulatedText(text);
              accumulatedTextRef.current = text;
              if (recordingIdRef.current) recordingTextRef.current = text;
              if (recordingIdRef.current && chunks.length > 0) {
                recordingWordsRef.current = chunks;
              }
            }
            currentSegmentRef.current = null;
            setCurrentSegmentPrefix("");
            setCurrentSegment("");
            void finalizeIfReady();
            break;
          }
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
            timestamp: [chunk.timestamp[0] + offsetSec, chunk.timestamp[1] + offsetSec],
          }));
          currentSegmentRef.current = null;

          if (evaluation.shouldKeep && evaluation.words.length > 0) {
            enqueueWordAnimation(evaluation.words, evaluation.text);
          } else if (evaluation.shouldKeep) {
            setAccumulatedText((prev) => {
              const nextText = prev ? `${prev} ${evaluation.text.trim()}` : evaluation.text.trim();
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
          // Before the model has ever reached "ready", an error means the model
          // itself failed to load — surface it instead of leaving the UI stuck
          // showing "loading" forever. Once ready, an error is just one bad
          // transcription chunk; recover and keep recording.
          if (statusRef.current !== "ready") {
            setStatus("error");
            setLoadingMessage(message.data);
            break;
          }
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
      void stopNemotronAudioGraph();
      void vadRef.current?.destroy();
      vadRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      clearWordAnimations();
    };
  }, [clearWordAnimations, stopNemotronAudioGraph]);

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

export type TranscriptSession = ReturnType<typeof useTranscript>;
