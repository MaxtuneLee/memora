import { useEffect, useMemo, useRef, useState } from "react";

export interface WaveformData {
  peaks: number[];
  duration: number;
}

type WaveformResult =
  | { url: string; data: WaveformData }
  | { url: string; error: true };

export const useWaveformData = (
  audioUrl: string | undefined,
  barCount: number = 200,
): { data: WaveformData | null; isLoading: boolean } => {
  const [result, setResult] = useState<WaveformResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!audioUrl) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    const extractWaveform = async () => {
      let audioContext: AudioContext | null = null;

      try {
        const response = await fetch(audioUrl, {
          signal: controller.signal,
        });
        const arrayBuffer = await response.arrayBuffer();

        if (cancelled || controller.signal.aborted) return;

        audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        if (cancelled || controller.signal.aborted) {
          return;
        }

        const channelData = audioBuffer.getChannelData(0);
        const samplesPerBar = Math.max(
          1,
          Math.floor(channelData.length / barCount),
        );

        const peaks: number[] = [];
        let maxPeak = 0;

        for (let i = 0; i < barCount; i++) {
          const start = i * samplesPerBar;
          const end = Math.min(start + samplesPerBar, channelData.length);
          if (start >= channelData.length) break;

          let sumSquares = 0;
          for (let j = start; j < end; j++) {
            sumSquares += channelData[j] * channelData[j];
          }
          const rms = Math.sqrt(sumSquares / (end - start));
          peaks.push(rms);
          if (rms > maxPeak) maxPeak = rms;
        }

        const normalizedPeaks = peaks.map((p) =>
          maxPeak > 0 ? p / maxPeak : 0,
        );

        if (!cancelled && !controller.signal.aborted) {
          setResult({
            url: audioUrl,
            data: { peaks: normalizedPeaks, duration: audioBuffer.duration },
          });
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          console.error("Failed to extract waveform:", error);
          setResult({ url: audioUrl, error: true });
        }
      } finally {
        if (audioContext && audioContext.state !== "closed") {
          void audioContext.close().catch(() => {
            // Ignore close failures from interrupted decoding.
          });
        }
      }
    };

    void extractWaveform();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [audioUrl, barCount]);

  const data = useMemo(() => {
    if (result && "data" in result && result.url === audioUrl) {
      return result.data;
    }
    return null;
  }, [result, audioUrl]);

  const isLoading = !!audioUrl && (!result || result.url !== audioUrl);

  return { data, isLoading };
};
