import { memo, useCallback, useEffect, useRef } from "react";

// Spatial smoothing: weighted average with neighbors for smoother bar heights
const smoothPeaksSpatially = (peaks: number[], passes: number = 2): number[] => {
  let result = [...peaks];
  for (let pass = 0; pass < passes; pass++) {
    const smoothed: number[] = [];
    for (let i = 0; i < result.length; i++) {
      const prev = result[i - 1] ?? result[i];
      const curr = result[i];
      const next = result[i + 1] ?? result[i];
      // Weighted average: 25% prev, 50% current, 25% next
      smoothed.push(prev * 0.25 + curr * 0.5 + next * 0.25);
    }
    result = smoothed;
  }
  return result;
};

const resamplePeaksToBars = (peaks: number[], barCount: number): number[] => {
  if (barCount <= 0 || peaks.length === 0) return [];
  const resampled: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const startIdx = Math.floor((i / barCount) * peaks.length);
    const endIdx = Math.min(
      Math.ceil(((i + 1) / barCount) * peaks.length),
      peaks.length
    );

    let maxPeak = 0;
    for (let j = startIdx; j < endIdx; j++) {
      if (peaks[j] > maxPeak) maxPeak = peaks[j];
    }
    resampled.push(maxPeak);
  }

  return smoothPeaksSpatially(resampled, 2);
};

const formatTimeMarker = (seconds: number): string => {
  const clamped = Math.max(0, seconds);
  const hrs = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  if (hrs > 0) {
    return `${hrs}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

interface WaveformCanvasProps {
  peaks: number[];
  progress: number; // 0-1 percentage of playback
  getProgress?: () => number;
  height: number;
  className?: string;
  playedColor?: string;
  unplayedColor?: string;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  smoothingFactor?: number; // 0-1, higher = faster scroll animation
  onClick?: (progress: number) => void;
  onDrag?: (progress: number) => void;
}

export const WaveformCanvas = memo(({
  peaks,
  progress,
  getProgress,
  height,
  className = "",
  playedColor = "#27272a", // zinc-800
  unplayedColor = "#d4d4d8", // zinc-300
  barWidth = 2,
  barGap = 1,
  barRadius = 1,
  smoothingFactor = 0.12,
  onClick,
  onDrag,
}: WaveformCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // Smoothing refs
  const smoothedProgressRef = useRef(progress);
  const cachedAmplitudesRef = useRef<number[]>([]);
  const lastWidthRef = useRef(0);
  const lastPeaksLengthRef = useRef(0);
  const lastProgressRef = useRef(progress);
  const lastProgressTimeRef = useRef<number | null>(null);

  // Store latest props in refs for animation loop access
  const propsRef = useRef({
    peaks,
    progress,
    getProgress,
    height,
    playedColor,
    unplayedColor,
    barWidth,
    barGap,
    barRadius,
    smoothingFactor,
  });

  // Update props ref when props change
  useEffect(() => {
    propsRef.current = {
      peaks,
      progress,
      getProgress,
      height,
      playedColor,
      unplayedColor,
      barWidth,
      barGap,
      barRadius,
      smoothingFactor,
    };
  }, [peaks, progress, getProgress, height, playedColor, unplayedColor, barWidth, barGap, barRadius, smoothingFactor]);

  // Handle interaction (click/drag) to seek
  const handleInteraction = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      return percentage;
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingRef.current = true;
      const progress = handleInteraction(e.clientX);
      if (progress !== undefined && onClick) {
        onClick(progress);
      }
    },
    [handleInteraction, onClick]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingRef.current) {
        const progress = handleInteraction(e.clientX);
        if (progress !== undefined && onDrag) {
          onDrag(progress);
        }
      }
    },
    [handleInteraction, onDrag]
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Global mouse up listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const resamplePeaks = useCallback((peaksData: number[], barCount: number): number[] => {
    return resamplePeaksToBars(peaksData, barCount);
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Initialize smoothed progress
    smoothedProgressRef.current = progress;

    const animate = () => {
      const props = propsRef.current;
      const { peaks: currentPeaks, height: currentHeight } = props;

      if (currentPeaks.length === 0) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const width = rect.width;

      // Resize canvas if needed
      if (canvas.width !== width * dpr || canvas.height !== currentHeight * dpr) {
        canvas.width = width * dpr;
        canvas.height = currentHeight * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${currentHeight}px`;
      }

      // Calculate bar dimensions
      const totalBarWidth = props.barWidth + props.barGap;
      const barCount = Math.floor(width / totalBarWidth);
      const centerY = currentHeight / 2;
      const maxBarHeight = currentHeight * 0.9;

      // Resample and cache if width or peaks changed
      if (
        width !== lastWidthRef.current ||
        currentPeaks.length !== lastPeaksLengthRef.current ||
        cachedAmplitudesRef.current.length !== barCount
      ) {
        lastWidthRef.current = width;
        lastPeaksLengthRef.current = currentPeaks.length;
        cachedAmplitudesRef.current = resamplePeaks(currentPeaks, barCount);
      }

      // Smooth progress toward target
      const rawTargetProgress = props.getProgress ? props.getProgress() : props.progress;
      const targetProgress = Number.isFinite(rawTargetProgress)
        ? Math.max(0, Math.min(1, rawTargetProgress))
        : 0;
      const progressDiff = targetProgress - smoothedProgressRef.current;
      const progressEase = props.smoothingFactor;

      // If progress jumps backwards significantly, snap to avoid wobble
      if (targetProgress < lastProgressRef.current && Math.abs(progressDiff) > 0.05) {
        smoothedProgressRef.current = targetProgress;
      } else {
        // Use time-based easing so animation is frame-rate independent
        const now = performance.now();
        const lastTime = lastProgressTimeRef.current ?? now;
        const deltaMs = Math.max(0, Math.min(64, now - lastTime));
        lastProgressTimeRef.current = now;
        const frameEase = 1 - Math.pow(1 - progressEase, deltaMs / 16.67);
        const effectiveEase = isDraggingRef.current ? Math.max(frameEase, 0.3) : frameEase;
        smoothedProgressRef.current += progressDiff * effectiveEase;
      }

      lastProgressRef.current = targetProgress;

      // Clamp to avoid overshoot
      if (Math.abs(progressDiff) < 0.0001) {
        smoothedProgressRef.current = targetProgress;
      }

      // Reset transform and clear
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, currentHeight);

      // Draw bars with smooth progress
      const playedBarIndexFloat = smoothedProgressRef.current * barCount;
      const playedBarIndex = Math.floor(playedBarIndexFloat);
      const partialFill = playedBarIndexFloat - playedBarIndex;

      for (let i = 0; i < barCount; i++) {
        const amplitude = cachedAmplitudesRef.current[i] ?? 0;
        const barHeight = Math.max(2, amplitude * maxBarHeight);
        const x = i * totalBarWidth;
        const y = centerY - barHeight / 2;

        // Determine color with smooth transition at playhead
        if (i < playedBarIndex) {
          ctx.fillStyle = props.playedColor;
        } else if (i === playedBarIndex) {
          // Blend color for the bar at the playhead
          ctx.fillStyle = interpolateColor(props.playedColor, props.unplayedColor, 1 - partialFill);
        } else {
          ctx.fillStyle = props.unplayedColor;
        }

        drawRoundedRect(ctx, x, y, props.barWidth, barHeight, props.barRadius);
      }

      // Continue the animation loop
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - loop runs continuously and reads from refs

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      lastWidthRef.current = 0; // Force resample on next frame
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative cursor-pointer select-none ${className}`}
      style={{ height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />
    </div>
  );
});

// Helper to draw a rounded rectangle
const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
};

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

export const ZoomWaveformCanvas = memo(({
  peaks,
  currentTime,
  duration,
  visibleSeconds = 7,
  height,
  className = "",
  playedColor = "#27272a", // zinc-800
  unplayedColor = "#d4d4d8", // zinc-300
  playheadColor = "#3b82f6", // blue-500
  smoothingFactor = 0.12,
  showTimeMarkers = true,
  markerStepSeconds = 1,
  markerColor = "#a1a1aa", // zinc-400
  markerFont = "12px ui-sans-serif, system-ui, -apple-system",
  audioRef,
}: ZoomWaveformCanvasProps) => {
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

  // Smoothing refs
  const smoothedTimeRef = useRef(currentTime ?? 0);
  const lastWidthRef = useRef(0);
  const lastTimeRef = useRef(currentTime ?? 0);
  const lastTimeStampRef = useRef<number | null>(null);

  // Store latest props in refs for animation loop access
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

  // Update props ref when props change
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
  }, [peaks, currentTime, duration, visibleSeconds, height, playedColor, unplayedColor, playheadColor, smoothingFactor, audioRef]);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Initialize smoothed time
    smoothedTimeRef.current = currentTime ?? 0;

    const animate = () => {
      const props = propsRef.current;
      const {
        peaks: currentPeaks,
        duration: currentDuration,
        visibleSeconds: currentVisibleSeconds,
        height: currentHeight,
      } = props;

      if (currentPeaks.length === 0 || !currentDuration) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const width = rect.width;

      // Resize canvas if needed
      if (canvas.width !== width * dpr || canvas.height !== currentHeight * dpr) {
        canvas.width = width * dpr;
        canvas.height = currentHeight * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${currentHeight}px`;
      }

      // Smooth time toward target
      const resolvedAudio = props.audioRef && "current" in props.audioRef ? props.audioRef.current : null;
      const liveTime = resolvedAudio?.currentTime;
      const targetTime = Number.isFinite(liveTime) ? (liveTime as number) : (props.currentTime ?? 0);
      const timeDiff = targetTime - smoothedTimeRef.current;
      const ease = props.smoothingFactor;

      // If time jumps backwards significantly, snap to avoid wobble
      if (targetTime < lastTimeRef.current && Math.abs(timeDiff) > 0.25) {
        smoothedTimeRef.current = targetTime;
      } else {
        const now = performance.now();
        const lastTime = lastTimeStampRef.current ?? now;
        const deltaMs = Math.max(0, Math.min(64, now - lastTime));
        lastTimeStampRef.current = now;
        const frameEase = 1 - Math.pow(1 - ease, deltaMs / 16.67);
        smoothedTimeRef.current += timeDiff * frameEase;
      }

      lastTimeRef.current = targetTime;

      // Clamp to avoid overshoot
      if (Math.abs(timeDiff) < 0.0001) {
        smoothedTimeRef.current = targetTime;
      }

      const smoothedTime = smoothedTimeRef.current;

      const markerAreaHeight = showTimeMarkers ? 22 : 0;
      const waveformHeight = Math.max(0, currentHeight - markerAreaHeight);

      // Bar settings
      const barWidth = 2;
      const barGap = 2;
      const totalBarWidth = barWidth + barGap;
      const barCount = Math.floor(width / totalBarWidth);
      const centerY = waveformHeight / 2;
      const maxBarHeight = waveformHeight * 0.85;

      // Build or reuse offscreen buffer (full waveform)
      const bufferMeta = bufferMetaRef.current;
      const paddingBars = Math.ceil(barCount / 2);
      const needsBufferRebuild =
        !bufferCanvasRef.current ||
        bufferMeta.peaksLength !== currentPeaks.length ||
        bufferMeta.duration !== currentDuration ||
        bufferMeta.height !== currentHeight ||
        bufferMeta.dpr !== dpr ||
        bufferMeta.barWidth !== barWidth ||
        bufferMeta.barGap !== barGap ||
        bufferMeta.paddingBars !== paddingBars;

      if (needsBufferRebuild) {
        const audioBarCount = Math.max(
          1,
          Math.ceil((currentDuration * barCount) / currentVisibleSeconds)
        );
        const totalBarCount = audioBarCount + paddingBars * 2;
        const bufferWidth = totalBarCount * totalBarWidth;

        const bufferCanvas = document.createElement("canvas");
        bufferCanvas.width = bufferWidth * dpr;
        bufferCanvas.height = currentHeight * dpr;

        const bufferCtx = bufferCanvas.getContext("2d");
        if (bufferCtx) {
          bufferCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          bufferCtx.clearRect(0, 0, bufferWidth, currentHeight);

          const resampled = resamplePeaksToBars(currentPeaks, audioBarCount);

          for (let i = 0; i < totalBarCount; i++) {
            const audioIndex = i - paddingBars;
            const amplitude = audioIndex >= 0 && audioIndex < audioBarCount
              ? resampled[audioIndex] ?? 0
              : 0;
            const barHeight = Math.max(3, amplitude * maxBarHeight);
            const x = i * totalBarWidth;
            const y = centerY - barHeight / 2;
            bufferCtx.fillStyle = unplayedColor;
            drawRoundedRect(bufferCtx, x, y, barWidth, barHeight, 1);
          }
        }

        bufferCanvasRef.current = bufferCanvas;
        bufferMetaRef.current = {
          peaksLength: currentPeaks.length,
          duration: currentDuration,
          height: currentHeight,
          dpr,
          barWidth,
          barGap,
          paddingBars,
        };
      }

      const bufferCanvas = bufferCanvasRef.current;
      const bufferWidth = bufferCanvas ? bufferCanvas.width / dpr : 0;
      const totalBarCount = bufferWidth / totalBarWidth;
      const paddingBarsCurrent = bufferMetaRef.current.paddingBars;
      const secondsPerBar = currentDuration / Math.max(1, totalBarCount);

      // Calculate source X so the playhead stays centered
      const centerTime = smoothedTime;
      const centerBar = centerTime / secondsPerBar + paddingBarsCurrent;
      const centerX = centerBar * totalBarWidth;
      const halfWidth = width / 2;
      const sourceX = Math.max(0, Math.min(bufferWidth - width, centerX - halfWidth));

      // Reset transform and clear
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, currentHeight);

      if (bufferCanvas) {
        ctx.drawImage(
          bufferCanvas,
          sourceX * dpr,
          0,
          width * dpr,
          currentHeight * dpr,
          0,
          0,
          width,
          currentHeight
        );
      }

      // Color overlay based on playhead position
      const playedWidth = Math.max(0, Math.min(width, halfWidth));
      ctx.fillStyle = playedColor;
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillRect(0, 0, playedWidth, currentHeight);
      ctx.globalCompositeOperation = "source-over";

      // Draw time markers along the bottom, separated by a gray line
      if (showTimeMarkers && currentDuration > 0 && markerAreaHeight > 0) {
        const separatorY = waveformHeight + 0.5;
        ctx.strokeStyle = "#e4e4e7"; // zinc-200
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, separatorY);
        ctx.lineTo(width, separatorY);
        ctx.stroke();

        const markerStep = Math.max(0.5, markerStepSeconds);
        const visibleStart = Math.max(0, centerTime - currentVisibleSeconds / 2);
        const visibleEnd = Math.min(currentDuration, centerTime + currentVisibleSeconds / 2);
        const firstMarker = Math.ceil(visibleStart / markerStep) * markerStep;

        ctx.font = markerFont;
        ctx.fillStyle = markerColor;
        ctx.textBaseline = "top";

        for (let t = firstMarker; t <= visibleEnd; t += markerStep) {
          const ratio = (t - centerTime) / currentVisibleSeconds + 0.5;
          const x = ratio * width;

          if (x < 0 || x > width) continue;
          const label = formatTimeMarker(t);
          const textWidth = ctx.measureText(label).width;
          ctx.fillText(label, x - textWidth / 2, waveformHeight + 4);
        }
      }

      // Draw playhead line
      const playheadX = width / 2;
      ctx.strokeStyle = props.playheadColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, waveformHeight);
      ctx.stroke();

      // Draw playhead dots
      ctx.fillStyle = props.playheadColor;
      ctx.beginPath();
      ctx.arc(playheadX, 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(playheadX, Math.max(6, waveformHeight - 6), 4, 0, Math.PI * 2);
      ctx.fill();

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - loop runs continuously and reads from refs

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      lastWidthRef.current = 0; // Force resample on next frame
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ height }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
});

// Helper to interpolate between two hex colors
const interpolateColor = (color1: string, color2: string, t: number): string => {
  const hex1 = color1.replace("#", "");
  const hex2 = color2.replace("#", "");

  const r1 = parseInt(hex1.slice(0, 2), 16);
  const g1 = parseInt(hex1.slice(2, 4), 16);
  const b1 = parseInt(hex1.slice(4, 6), 16);

  const r2 = parseInt(hex2.slice(0, 2), 16);
  const g2 = parseInt(hex2.slice(2, 4), 16);
  const b2 = parseInt(hex2.slice(4, 6), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `rgb(${r}, ${g}, ${b})`;
};
