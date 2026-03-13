import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  stream: MediaStream | null;
  className?: string;
}

export function AudioVisualizer({ stream, className }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const previousHeightsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!stream) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);

    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    previousHeightsRef.current = [];

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width));
      canvas.height = Math.max(1, Math.floor(height));
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas.parentElement ?? canvas);

    const drawRoundedRect = (
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number
    ) => {
      const clampedRadius = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + clampedRadius, y);
      ctx.lineTo(x + width - clampedRadius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
      ctx.lineTo(x + width, y + height - clampedRadius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
      ctx.lineTo(x + clampedRadius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
      ctx.lineTo(x, y + clampedRadius);
      ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
      ctx.closePath();
      ctx.fill();
    };

    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(
        dataArrayRef.current as Uint8Array<ArrayBuffer>
      );

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const barCount = Math.max(12, Math.floor(width / 9));
      const gap = width / (barCount + 1);
      const midY = height / 2;
      const maxBarHeight = height * 0.85;
      const minBarHeight = Math.max(3, height * 0.12);
      const dotRadius = Math.max(1.5, Math.min(3, height * 0.1));
      const barWidth = Math.max(2, gap * 0.38);
      const dotThreshold = 0.06;
      const binCount = dataArrayRef.current.length;
      const smoothing = 0.7;
      const spatialSmoothing = 0.4;
      const minBin = Math.floor(binCount * 0.06);
      const maxBin = Math.floor(binCount * 0.9);
      const binRange = Math.max(1, maxBin - minBin);

      ctx.fillStyle = "rgb(161, 161, 170)";

      for (let i = 0; i < barCount; i++) {
        const normalizedIndex = i / (barCount - 1 || 1);
        const weightedIndex = Math.pow(normalizedIndex, 1.2);
        const sampleIndex = Math.min(
          binCount - 1,
          Math.floor(minBin + weightedIndex * binRange)
        );
        const sample = dataArrayRef.current[sampleIndex] ?? 0;
        const normalized = sample / 255;
        const responsive = Math.min(1, Math.pow(normalized, 0.55) * 2.6);
        const targetHeight = minBarHeight + responsive * (maxBarHeight - minBarHeight);
        const previousHeight = previousHeightsRef.current[i] ?? targetHeight;
        const heightSmooth = previousHeight * smoothing + targetHeight * (1 - smoothing);
        const leftHeight = previousHeightsRef.current[i - 1] ?? heightSmooth;
        const barHeight =
          heightSmooth * (1 - spatialSmoothing) + leftHeight * spatialSmoothing;
        previousHeightsRef.current[i] = barHeight;
        const x = gap * (i + 1) - barWidth / 2;

        if (normalized < dotThreshold) {
          ctx.beginPath();
          ctx.arc(gap * (i + 1), midY, dotRadius, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        const y = midY - barHeight / 2;
        drawRoundedRect(x, y, barWidth, barHeight, barWidth / 2);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
      source.disconnect();
      audioContext.close();
    };
  }, [stream]);

  return <canvas ref={canvasRef} className={className} />;
}
