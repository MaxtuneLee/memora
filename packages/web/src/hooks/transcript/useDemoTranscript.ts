import { useCallback, useEffect, useRef, useState } from "react";

import { useAppStore } from "@/livestore/store";
import type { RecordingWord } from "@/types/library";
import { saveRecording, type SaveRecordingResult } from "@/lib/library/fileService";
import { TRANSCRIPT_LANGUAGE_STORAGE_KEY } from "@/lib/transcript/transcriptUtils";
import type { WhisperProgressItem } from "@/lib/transcript/whisper/client";
import {
  DEMO_LECTURE_AUDIO_URL,
  DEMO_LECTURE_MIME,
  DEMO_LECTURE_NAME,
  DEMO_LECTURE_SEGMENTS,
  type DemoLectureSegment,
} from "@/lib/demo/bayesLecture";
import { useWordAnimation } from "@/hooks/transcript/useTranscript/useWordAnimation";
import { buildSavedRecordingEvents } from "@/hooks/transcript/useTranscript/useRecordingFinalizer";
import type { TranscriptSession } from "@/hooks/transcript/useTranscript";

const TICK_MS = 100;
const EMPTY_PROGRESS: WhisperProgressItem[] = [];

interface LecturePlayback {
  audio: HTMLAudioElement;
  context: AudioContext;
  stream: MediaStream;
}

interface CaptureState {
  stream: MediaStream | null;
  recording: boolean;
  paused: boolean;
}

const IDLE_CAPTURE: CaptureState = { stream: null, recording: false, paused: false };

const readLanguage = (): string => localStorage.getItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY) ?? "en";

/** The segments after the first `heardCount` that the lecture has reached. */
const dueSegments = (heardCount: number, audio: HTMLAudioElement): DemoLectureSegment[] => {
  const now = audio.ended ? Number.POSITIVE_INFINITY : audio.currentTime;
  return DEMO_LECTURE_SEGMENTS.slice(heardCount).filter((segment) => segment.readyAt <= now);
};

/** Plays the lecture aloud and exposes it as a stream for the waveform. */
const startLecturePlayback = async (): Promise<LecturePlayback> => {
  const audio = new Audio(DEMO_LECTURE_AUDIO_URL);
  const context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  const destination = context.createMediaStreamDestination();
  source.connect(destination);
  source.connect(context.destination);
  await context.resume();
  await audio.play();
  return { audio, context, stream: destination.stream };
};

const stopLecturePlayback = (playback: LecturePlayback): void => {
  playback.audio.pause();
  playback.audio.removeAttribute("src");
  void playback.context.close().catch(() => {});
};

const saveDemoLecture = async (
  heard: readonly DemoLectureSegment[],
  durationSec: number | undefined,
): Promise<SaveRecordingResult> => {
  const response = await fetch(DEMO_LECTURE_AUDIO_URL);
  if (!response.ok) throw new Error(`Demo lecture audio returned ${response.status}.`);
  const words: RecordingWord[] = heard.flatMap((segment) => segment.words);
  return saveRecording({
    id: crypto.randomUUID(),
    blob: await response.blob(),
    name: DEMO_LECTURE_NAME,
    type: "audio",
    mimeType: DEMO_LECTURE_MIME,
    durationSec,
    transcriptText: heard.map((segment) => segment.text).join(" "),
    transcriptWords: words,
    createdAt: Date.now(),
  });
};

/** Plays the lecture and calls `onTick` while it plays, until `onTick` returns true. */
const useLecturePlayback = (onTick: (audio: HTMLAudioElement) => boolean) => {
  const playbackRef = useRef<LecturePlayback | null>(null);
  const tickRef = useRef<number | null>(null);

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const startTicking = useCallback(() => {
    stopTicking();
    tickRef.current = window.setInterval(() => {
      if (playbackRef.current && onTick(playbackRef.current.audio)) stopTicking();
    }, TICK_MS);
  }, [onTick, stopTicking]);

  /** Stops playback and returns the lecture's duration, when known. */
  const stop = useCallback((): number | undefined => {
    stopTicking();
    const duration = playbackRef.current?.audio.duration;
    if (playbackRef.current) stopLecturePlayback(playbackRef.current);
    playbackRef.current = null;
    return Number.isFinite(duration) ? duration : undefined;
  }, [stopTicking]);

  const start = useCallback(async (): Promise<MediaStream> => {
    stop();
    playbackRef.current = await startLecturePlayback();
    startTicking();
    return playbackRef.current.stream;
  }, [startTicking, stop]);

  const pause = useCallback(() => {
    playbackRef.current?.audio.pause();
    stopTicking();
  }, [stopTicking]);

  const resume = useCallback(() => {
    if (!playbackRef.current) return;
    void playbackRef.current.audio.play();
    startTicking();
  }, [startTicking]);

  useEffect(() => () => void stop(), [stop]);

  return { start, pause, resume, stop };
};

/** Saves what was heard as a library recording and reports the save status. */
const useDemoLectureSaver = () => {
  const store = useAppStore();
  const [saved, setSaved] = useState<{ status: "idle" | "saving" | "success"; id: string | null }>({
    status: "idle",
    id: null,
  });

  const save = useCallback(
    (heard: readonly DemoLectureSegment[], durationSec: number | undefined) => {
      setSaved({ status: "saving", id: null });
      saveDemoLecture(heard, durationSec)
        .then((result) => {
          store.commit(...buildSavedRecordingEvents(result));
          setSaved({ status: "success", id: result.id });
          window.setTimeout(() => setSaved({ status: "idle", id: result.id }), 1500);
        })
        .catch((error: unknown) => {
          console.error("[demo-transcript] save failed", error);
          setSaved({ status: "idle", id: null });
        });
    },
    [store],
  );

  return { saved, save };
};

const noop = (): void => {};
const modelIsCached = async (): Promise<boolean> => true;

const useTranscriptLanguage = () => {
  const [language, setLanguage] = useState(readLanguage);
  const updateLanguage = useCallback((next: string) => {
    setLanguage(next);
    localStorage.setItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY, next);
  }, []);
  return { language, updateLanguage };
};

/** The live transcript text, revealed segment by segment as the lecture reaches it. */
const useLectureTranscript = () => {
  const [accumulatedText, setAccumulatedText] = useState("");
  const [currentSegmentPrefix, setCurrentSegmentPrefix] = useState("");
  const [currentSegment, setCurrentSegment] = useState("");
  const accumulatedTextRef = useRef("");
  const heardCountRef = useRef(0);
  const { clearWordAnimations, enqueueWordAnimation } = useWordAnimation({
    accumulatedTextRef,
    setAccumulatedText,
    setCurrentSegmentPrefix,
    setCurrentSegment,
  });

  // Returns true once every segment is revealed, so playback can stop checking.
  const revealHeardSegments = useCallback(
    (audio: HTMLAudioElement) => {
      const due = dueSegments(heardCountRef.current, audio);
      heardCountRef.current += due.length;
      due.forEach((segment) => enqueueWordAnimation(segment.words, segment.text));
      return heardCountRef.current >= DEMO_LECTURE_SEGMENTS.length;
    },
    [enqueueWordAnimation],
  );

  const clearTranscript = useCallback(() => {
    clearWordAnimations();
    accumulatedTextRef.current = "";
    setAccumulatedText("");
    heardCountRef.current = 0;
  }, [clearWordAnimations]);

  const heardSegments = useCallback(
    () => DEMO_LECTURE_SEGMENTS.slice(0, heardCountRef.current),
    [],
  );

  useEffect(() => clearWordAnimations, [clearWordAnimations]);

  return {
    text: { accumulatedText, currentSegmentPrefix, currentSegment },
    revealHeardSegments,
    clearTranscript,
    heardSegments,
  };
};

const useDemoRecordingControls = ({
  playback,
  transcript,
  save,
}: {
  playback: ReturnType<typeof useLecturePlayback>;
  transcript: ReturnType<typeof useLectureTranscript>;
  save: ReturnType<typeof useDemoLectureSaver>["save"];
}) => {
  const [capture, setCapture] = useState<CaptureState>(IDLE_CAPTURE);
  const { clearTranscript, heardSegments } = transcript;

  const handleStartRecording = useCallback(async () => {
    clearTranscript();
    const stream = await playback.start();
    setCapture({ stream, recording: true, paused: false });
  }, [clearTranscript, playback]);

  const handlePauseRecording = useCallback(() => {
    playback.pause();
    setCapture((current) => ({ ...current, paused: true }));
  }, [playback]);

  const handleResumeRecording = useCallback(() => {
    playback.resume();
    setCapture((current) => ({ ...current, paused: false }));
  }, [playback]);

  const handleFinalizeRecording = useCallback(() => {
    const durationSec = playback.stop();
    setCapture(IDLE_CAPTURE);
    save(heardSegments(), durationSec);
  }, [heardSegments, playback, save]);

  const handleReset = useCallback(() => {
    playback.stop();
    clearTranscript();
    setCapture(IDLE_CAPTURE);
  }, [clearTranscript, playback]);

  return {
    capture,
    handleStartRecording,
    handlePauseRecording,
    handleResumeRecording,
    handleFinalizeRecording,
    handleReset,
  };
};

/**
 * Demo mode stand-in for useTranscript: plays the prepared lecture instead of opening the
 * microphone, and reveals its transcript on the lecture's own timeline.
 */
export const useDemoTranscript = (): TranscriptSession => {
  const { language, updateLanguage } = useTranscriptLanguage();
  const transcript = useLectureTranscript();
  const playback = useLecturePlayback(transcript.revealHeardSegments);
  const { saved, save } = useDemoLectureSaver();
  const { capture, ...controls } = useDemoRecordingControls({ playback, transcript, save });

  return {
    isWebGpuAvailable: true,
    status: "ready",
    loadingMessage: "",
    progressItems: EMPTY_PROGRESS,
    ...transcript.text,
    tps: null,
    ...capture,
    saveStatus: saved.status,
    lastSavedId: saved.id,
    language,
    isModelCached: true,
    isCheckingCache: false,
    lastSegmentDiagnostics: null,
    loadModel: noop,
    updateLanguage,
    checkModelCache: modelIsCached,
    ...controls,
  };
};
