import { memo, useCallback, useEffect, useRef } from "react";

import { drawRoundedRect, interpolateColor, resamplePeaksToBars } from "@/lib/audio/waveformCanvas";

interface WaveformCanvasProps {
  peaks: number[];
  progress: number;
  getProgress?: () => number;
  height: number;
  className?: string;
  playedColor?: string;
  unplayedColor?: string;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  smoothingFactor?: number;
  onClick?: (progress: number) => void;
  onDrag?: (progress: number) => void;
}

export const WaveformCanvas = memo(function WaveformCanvas({
  peaks,
  progress,
  getProgress,
  height,
  className = "",
  playedColor = "#27272a",
  unplayedColor = "#d4d4d8",
  barWidth = 2,
  barGap = 1,
  barRadius = 1,
  smoothingFactor = 0.12,
  onClick,
  onDrag,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedProgressRef = useRef(progress);
  const cachedAmplitudesRef = useRef<number[]>([]);
  const lastWidthRef = useRef(0);
  const lastPeaksLengthRef = useRef(0);
  const lastProgressRef = useRef(progress);
  const lastProgressTimeRef = useRef<number | null>(null);
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
  }, [
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
  ]);

  const handleInteraction = useCallback((clientX: number) => {
    if (!containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      isDraggingRef.current = true;
      const nextProgress = handleInteraction(event.clientX);
      if (nextProgress !== undefined) {
        onClick?.(nextProgress);
      }
    },
    [handleInteraction, onClick],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!isDraggingRef.current) {
        return;
      }

      const nextProgress = handleInteraction(event.clientX);
      if (nextProgress !== undefined) {
        onDrag?.(nextProgress);
      }
    },
    [handleInteraction, onDrag],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, []);

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

    smoothedProgressRef.current = progress;

    const animate = () => {
      const currentProps = propsRef.current;
      const { peaks: currentPeaks, height: currentHeight } = currentProps;

      if (currentPeaks.length === 0) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const devicePixelRatio = window.devicePixelRatio || 1;
      const width = container.getBoundingClientRect().width;

      if (
        canvas.width !== width * devicePixelRatio ||
        canvas.height !== currentHeight * devicePixelRatio
      ) {
        canvas.width = width * devicePixelRatio;
        canvas.height = currentHeight * devicePixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${currentHeight}px`;
      }

      const totalBarWidth = currentProps.barWidth + currentProps.barGap;
      const barCount = Math.floor(width / totalBarWidth);
      const centerY = currentHeight / 2;
      const maxBarHeight = currentHeight * 0.9;

      if (
        width !== lastWidthRef.current ||
        currentPeaks.length !== lastPeaksLengthRef.current ||
        cachedAmplitudesRef.current.length !== barCount
      ) {
        lastWidthRef.current = width;
        lastPeaksLengthRef.current = currentPeaks.length;
        cachedAmplitudesRef.current = resamplePeaksToBars(currentPeaks, barCount);
      }

      const rawTargetProgress = currentProps.getProgress
        ? currentProps.getProgress()
        : currentProps.progress;
      const targetProgress = Number.isFinite(rawTargetProgress)
        ? Math.max(0, Math.min(1, rawTargetProgress))
        : 0;
      const progressDiff = targetProgress - smoothedProgressRef.current;

      if (targetProgress < lastProgressRef.current && Math.abs(progressDiff) > 0.05) {
        smoothedProgressRef.current = targetProgress;
      } else {
        const now = performance.now();
        const lastTime = lastProgressTimeRef.current ?? now;
        const deltaMs = Math.max(0, Math.min(64, now - lastTime));
        lastProgressTimeRef.current = now;
        const frameEase = 1 - Math.pow(1 - currentProps.smoothingFactor, deltaMs / 16.67);
        const effectiveEase = isDraggingRef.current ? Math.max(frameEase, 0.3) : frameEase;
        smoothedProgressRef.current += progressDiff * effectiveEase;
      }

      lastProgressRef.current = targetProgress;
      if (Math.abs(progressDiff) < 0.0001) {
        smoothedProgressRef.current = targetProgress;
      }

      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, width, currentHeight);

      const playedBarIndexFloat = smoothedProgressRef.current * barCount;
      const playedBarIndex = Math.floor(playedBarIndexFloat);
      const partialFill = playedBarIndexFloat - playedBarIndex;

      for (let index = 0; index < barCount; index += 1) {
        const amplitude = cachedAmplitudesRef.current[index] ?? 0;
        const barHeight = Math.max(2, amplitude * maxBarHeight);
        const x = index * totalBarWidth;
        const y = centerY - barHeight / 2;

        if (index < playedBarIndex) {
          context.fillStyle = currentProps.playedColor;
        } else if (index === playedBarIndex) {
          context.fillStyle = interpolateColor(
            currentProps.playedColor,
            currentProps.unplayedColor,
            1 - partialFill,
          );
        } else {
          context.fillStyle = currentProps.unplayedColor;
        }

        drawRoundedRect(context, x, y, currentProps.barWidth, barHeight, currentProps.barRadius);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [progress]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      lastWidthRef.current = 0;
    });
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
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
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
});
