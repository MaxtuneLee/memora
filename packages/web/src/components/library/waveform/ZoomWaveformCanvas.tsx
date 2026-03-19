import { memo, useEffect, useRef } from "react";

import {
  drawRoundedRect,
  formatTimeMarker,
  resamplePeaksToBars,
} from "@/lib/audio/waveformCanvas";

interface ZoomWaveformCanvasProps {
  peaks: number[];
  currentTime?: number;
  duration: number;
  visibleSeconds?: number;
  height: number;
  className?: string;
  playedColor?: string;
  unplayedColor?: string;
  playheadColor?: string;
  smoothingFactor?: number;
  showTimeMarkers?: boolean;
  markerStepSeconds?: number;
  markerColor?: string;
  markerFont?: string;
  audioRef?: React.RefObject<HTMLAudioElement | null> | React.Ref<HTMLAudioElement>;
}

export const ZoomWaveformCanvas = memo(function ZoomWaveformCanvas({
  peaks,
  currentTime,
  duration,
  visibleSeconds = 7,
  height,
  className = "",
  playedColor = "#27272a",
  unplayedColor = "#d4d4d8",
  playheadColor = "#3b82f6",
  smoothingFactor = 0.12,
  showTimeMarkers = true,
  markerStepSeconds = 1,
  markerColor = "#a1a1aa",
  markerFont = "12px ui-sans-serif, system-ui, -apple-system",
  audioRef,
}: ZoomWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferMetaRef = useRef({
    peaksLength: 0,
    duration: 0,
    height: 0,
    dpr: 1,
    barWidth: 2,
    barGap: 2,
    paddingBars: 0,
  });
  const smoothedTimeRef = useRef(currentTime ?? 0);
  const lastTimeRef = useRef(currentTime ?? 0);
  const lastTimeStampRef = useRef<number | null>(null);
  const propsRef = useRef({
    peaks,
    currentTime,
    duration,
    visibleSeconds,
    height,
    playedColor,
    unplayedColor,
    playheadColor,
    smoothingFactor,
    audioRef,
  });

  useEffect(() => {
    propsRef.current = {
      peaks,
      currentTime,
      duration,
      visibleSeconds,
      height,
      playedColor,
      unplayedColor,
      playheadColor,
      smoothingFactor,
      audioRef,
    };
  }, [
    peaks,
    currentTime,
    duration,
    visibleSeconds,
    height,
    playedColor,
    unplayedColor,
    playheadColor,
    smoothingFactor,
    audioRef,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    smoothedTimeRef.current = currentTime ?? 0;

    const animate = () => {
      const currentProps = propsRef.current;
      if (currentProps.peaks.length === 0 || !currentProps.duration) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const devicePixelRatio = window.devicePixelRatio || 1;
      const width = container.getBoundingClientRect().width;

      if (
        canvas.width !== width * devicePixelRatio ||
        canvas.height !== currentProps.height * devicePixelRatio
      ) {
        canvas.width = width * devicePixelRatio;
        canvas.height = currentProps.height * devicePixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${currentProps.height}px`;
      }

      const resolvedAudio =
        currentProps.audioRef && "current" in currentProps.audioRef
          ? currentProps.audioRef.current
          : null;
      const liveTime = resolvedAudio?.currentTime;
      const targetTime = Number.isFinite(liveTime)
        ? (liveTime as number)
        : (currentProps.currentTime ?? 0);
      const timeDiff = targetTime - smoothedTimeRef.current;

      if (targetTime < lastTimeRef.current && Math.abs(timeDiff) > 0.25) {
        smoothedTimeRef.current = targetTime;
      } else {
        const now = performance.now();
        const lastTime = lastTimeStampRef.current ?? now;
        const deltaMs = Math.max(0, Math.min(64, now - lastTime));
        lastTimeStampRef.current = now;
        const frameEase =
          1 - Math.pow(1 - currentProps.smoothingFactor, deltaMs / 16.67);
        smoothedTimeRef.current += timeDiff * frameEase;
      }

      lastTimeRef.current = targetTime;
      if (Math.abs(timeDiff) < 0.0001) {
        smoothedTimeRef.current = targetTime;
      }

      const markerAreaHeight = showTimeMarkers ? 22 : 0;
      const waveformHeight = Math.max(0, currentProps.height - markerAreaHeight);
      const barWidth = 2;
      const barGap = 2;
      const totalBarWidth = barWidth + barGap;
      const barCount = Math.floor(width / totalBarWidth);
      const centerY = waveformHeight / 2;
      const maxBarHeight = waveformHeight * 0.85;
      const paddingBars = Math.ceil(barCount / 2);
      const bufferMeta = bufferMetaRef.current;

      const needsBufferRebuild =
        !bufferCanvasRef.current ||
        bufferMeta.peaksLength !== currentProps.peaks.length ||
        bufferMeta.duration !== currentProps.duration ||
        bufferMeta.height !== currentProps.height ||
        bufferMeta.dpr !== devicePixelRatio ||
        bufferMeta.barWidth !== barWidth ||
        bufferMeta.barGap !== barGap ||
        bufferMeta.paddingBars !== paddingBars;

      if (needsBufferRebuild) {
        const audioBarCount = Math.max(
          1,
          Math.ceil((currentProps.duration * barCount) / currentProps.visibleSeconds),
        );
        const totalBarCount = audioBarCount + paddingBars * 2;
        const bufferWidth = totalBarCount * totalBarWidth;
        const bufferCanvas = document.createElement("canvas");
        bufferCanvas.width = bufferWidth * devicePixelRatio;
        bufferCanvas.height = currentProps.height * devicePixelRatio;

        const bufferContext = bufferCanvas.getContext("2d");
        if (bufferContext) {
          bufferContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
          bufferContext.clearRect(0, 0, bufferWidth, currentProps.height);

          const resampledPeaks = resamplePeaksToBars(
            currentProps.peaks,
            audioBarCount,
          );

          for (let index = 0; index < totalBarCount; index += 1) {
            const audioIndex = index - paddingBars;
            const amplitude =
              audioIndex >= 0 && audioIndex < audioBarCount
                ? resampledPeaks[audioIndex] ?? 0
                : 0;
            const barHeight = Math.max(3, amplitude * maxBarHeight);
            const x = index * totalBarWidth;
            const y = centerY - barHeight / 2;
            bufferContext.fillStyle = unplayedColor;
            drawRoundedRect(bufferContext, x, y, barWidth, barHeight, 1);
          }
        }

        bufferCanvasRef.current = bufferCanvas;
        bufferMetaRef.current = {
          peaksLength: currentProps.peaks.length,
          duration: currentProps.duration,
          height: currentProps.height,
          dpr: devicePixelRatio,
          barWidth,
          barGap,
          paddingBars,
        };
      }

      const bufferCanvas = bufferCanvasRef.current;
      const bufferWidth = bufferCanvas ? bufferCanvas.width / devicePixelRatio : 0;
      const totalBarCount = bufferWidth / totalBarWidth;
      const secondsPerBar = currentProps.duration / Math.max(1, totalBarCount);
      const centerTime = smoothedTimeRef.current;
      const centerBar = centerTime / secondsPerBar + bufferMetaRef.current.paddingBars;
      const centerX = centerBar * totalBarWidth;
      const halfWidth = width / 2;
      const sourceX = Math.max(
        0,
        Math.min(bufferWidth - width, centerX - halfWidth),
      );

      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, width, currentProps.height);

      if (bufferCanvas) {
        context.drawImage(
          bufferCanvas,
          sourceX * devicePixelRatio,
          0,
          width * devicePixelRatio,
          currentProps.height * devicePixelRatio,
          0,
          0,
          width,
          currentProps.height,
        );
      }

      context.fillStyle = currentProps.playedColor;
      context.globalCompositeOperation = "source-atop";
      context.fillRect(0, 0, Math.max(0, Math.min(width, halfWidth)), currentProps.height);
      context.globalCompositeOperation = "source-over";

      if (showTimeMarkers && currentProps.duration > 0 && markerAreaHeight > 0) {
        const separatorY = waveformHeight + 0.5;
        context.strokeStyle = "#e4e4e7";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(0, separatorY);
        context.lineTo(width, separatorY);
        context.stroke();

        const markerStep = Math.max(0.5, markerStepSeconds);
        const visibleStart = Math.max(
          0,
          centerTime - currentProps.visibleSeconds / 2,
        );
        const visibleEnd = Math.min(
          currentProps.duration,
          centerTime + currentProps.visibleSeconds / 2,
        );
        const firstMarker = Math.ceil(visibleStart / markerStep) * markerStep;

        context.font = markerFont;
        context.fillStyle = markerColor;
        context.textBaseline = "top";

        for (let marker = firstMarker; marker <= visibleEnd; marker += markerStep) {
          const ratio =
            (marker - centerTime) / currentProps.visibleSeconds + 0.5;
          const x = ratio * width;
          if (x < 0 || x > width) {
            continue;
          }

          const label = formatTimeMarker(marker);
          const textWidth = context.measureText(label).width;
          context.fillText(label, x - textWidth / 2, waveformHeight + 4);
        }
      }

      const playheadX = width / 2;
      context.strokeStyle = currentProps.playheadColor;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, waveformHeight);
      context.stroke();

      context.fillStyle = currentProps.playheadColor;
      context.beginPath();
      context.arc(playheadX, 6, 4, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(playheadX, Math.max(6, waveformHeight - 6), 4, 0, Math.PI * 2);
      context.fill();

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    currentTime,
    height,
    markerColor,
    markerFont,
    markerStepSeconds,
    showTimeMarkers,
    unplayedColor,
  ]);

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
});
