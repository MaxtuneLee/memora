import { useCallback, useRef, type MutableRefObject } from "react";

import type { TranscriptionRuntime } from "@/lib/models/transcriptionRuntime";
import { WHISPER_SAMPLE_RATE } from "@/lib/transcript/transcriptUtils";
import {
  abortStreamingTranscription,
  finishStreamingTranscription,
  startStreamingTranscription,
  writeStreamingTranscription,
} from "@/lib/transcript/whisper/client";

// Nemotron's RNN-T decoder carries hidden state across the whole recording, so audio
// streams through a single continuous session for the whole recording rather than a
// fresh one per pause: reopening the session resets that state and garbles word
// boundaries at every cut. Frames are still batched into 200ms/3,200-sample blocks and
// capped at 24 in-flight writes so a slow model can't grow unbounded latency.
const FLUSH_SAMPLES = WHISPER_SAMPLE_RATE * 0.2;
const MAX_PENDING_BLOCKS = 24;

const concatFrames = (frames: Float32Array[], length: number): Float32Array => {
  const out = new Float32Array(length);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
};

export const useNemotronStreamCapture = ({
  workerRef,
  runtimeRef,
  languageRef,
}: {
  workerRef: MutableRefObject<Worker | null>;
  runtimeRef: MutableRefObject<TranscriptionRuntime | null>;
  languageRef: { current: string };
}) => {
  const batchRef = useRef<Float32Array[]>([]);
  const batchLenRef = useRef(0);
  const pendingBlocksRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<AudioWorkletNode | null>(null);
  const audioSinkRef = useRef<GainNode | null>(null);

  const flushBatch = useCallback(() => {
    if (batchLenRef.current === 0) return;
    const chunk = concatFrames(batchRef.current, batchLenRef.current);
    batchRef.current = [];
    batchLenRef.current = 0;
    const worker = workerRef.current;
    if (!worker) return;
    if (pendingBlocksRef.current >= MAX_PENDING_BLOCKS) return;
    pendingBlocksRef.current += 1;
    writeStreamingTranscription(worker, chunk)
      .catch(() => {})
      .finally(() => {
        pendingBlocksRef.current = Math.max(0, pendingBlocksRef.current - 1);
      });
  }, [workerRef]);

  const pushFrame = useCallback(
    (frame: Float32Array) => {
      batchRef.current.push(frame);
      batchLenRef.current += frame.length;
      if (batchLenRef.current >= FLUSH_SAMPLES) flushBatch();
    },
    [flushBatch],
  );

  const stopAudioGraph = useCallback(async (): Promise<void> => {
    const processor = audioProcessorRef.current;
    processor?.port.close();
    processor?.disconnect();
    audioProcessorRef.current = null;
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    audioSinkRef.current?.disconnect();
    audioSinkRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) await context.close();
  }, []);

  const start = useCallback(
    async (mediaStream: MediaStream) => {
      await stopAudioGraph();
      batchRef.current = [];
      batchLenRef.current = 0;
      pendingBlocksRef.current = 0;
      const runtime = runtimeRef.current;
      const worker = workerRef.current;
      if (!runtime || !worker) return;
      let streamStarted = false;
      try {
        const context = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });
        audioContextRef.current = context;
        if (context.sampleRate !== WHISPER_SAMPLE_RATE) {
          throw new Error("This browser cannot provide 16000 Hz audio for Nemotron.");
        }
        await context.audioWorklet.addModule(
          new URL("../../../worklets/pcm-processor.ts", import.meta.url),
        );
        const source = context.createMediaStreamSource(mediaStream);
        const processor = new AudioWorkletNode(context, "pcm-processor");
        const silentSink = context.createGain();
        silentSink.gain.value = 0;
        processor.port.onmessage = (event: MessageEvent<unknown>) => {
          if (event.data instanceof Float32Array) pushFrame(event.data);
        };
        audioSourceRef.current = source;
        audioProcessorRef.current = processor;
        audioSinkRef.current = silentSink;
        await startStreamingTranscription(worker, runtime, languageRef.current);
        streamStarted = true;
        source.connect(processor);
        processor.connect(silentSink);
        silentSink.connect(context.destination);
        await context.resume();
      } catch (error) {
        if (streamStarted) abortStreamingTranscription(worker);
        try {
          await stopAudioGraph();
        } catch (cleanupError) {
          console.error(
            "Failed to close the Nemotron audio graph after setup failed.",
            cleanupError,
          );
        }
        throw error;
      }
    },
    [languageRef, pushFrame, runtimeRef, stopAudioGraph, workerRef],
  );

  const stop = useCallback(async () => {
    await stopAudioGraph();
    flushBatch();
    const worker = workerRef.current;
    if (worker) await finishStreamingTranscription(worker);
  }, [flushBatch, stopAudioGraph, workerRef]);

  const suspend = useCallback(() => {
    void audioContextRef.current?.suspend();
  }, []);

  const resume = useCallback(() => {
    void audioContextRef.current?.resume();
  }, []);

  return { pushFrame, start, stop, suspend, resume, stopAudioGraph };
};
