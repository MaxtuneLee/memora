export const smoothPeaksSpatially = (
  peaks: number[],
  passes: number = 2,
): number[] => {
  let result = [...peaks];

  for (let pass = 0; pass < passes; pass += 1) {
    const smoothed: number[] = [];

    for (let index = 0; index < result.length; index += 1) {
      const previousPeak = result[index - 1] ?? result[index];
      const currentPeak = result[index];
      const nextPeak = result[index + 1] ?? result[index];
      smoothed.push(previousPeak * 0.25 + currentPeak * 0.5 + nextPeak * 0.25);
    }

    result = smoothed;
  }

  return result;
};

export const resamplePeaksToBars = (
  peaks: number[],
  barCount: number,
): number[] => {
  if (barCount <= 0 || peaks.length === 0) {
    return [];
  }

  const resampled: number[] = [];
  for (let index = 0; index < barCount; index += 1) {
    const startIndex = Math.floor((index / barCount) * peaks.length);
    const endIndex = Math.min(
      Math.ceil(((index + 1) / barCount) * peaks.length),
      peaks.length,
    );

    let maxPeak = 0;
    for (let peakIndex = startIndex; peakIndex < endIndex; peakIndex += 1) {
      if (peaks[peakIndex] > maxPeak) {
        maxPeak = peaks[peakIndex];
      }
    }

    resampled.push(maxPeak);
  }

  return smoothPeaksSpatially(resampled, 2);
};

export const formatTimeMarker = (seconds: number): string => {
  const clampedSeconds = Math.max(0, seconds);
  const hours = Math.floor(clampedSeconds / 3600);
  const minutes = Math.floor((clampedSeconds % 3600) / 60);
  const secs = Math.floor(clampedSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

export const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fill();
};

export const interpolateColor = (
  firstColor: string,
  secondColor: string,
  t: number,
): string => {
  const hex1 = firstColor.replace("#", "");
  const hex2 = secondColor.replace("#", "");

  const r1 = Number.parseInt(hex1.slice(0, 2), 16);
  const g1 = Number.parseInt(hex1.slice(2, 4), 16);
  const b1 = Number.parseInt(hex1.slice(4, 6), 16);

  const r2 = Number.parseInt(hex2.slice(0, 2), 16);
  const g2 = Number.parseInt(hex2.slice(2, 4), 16);
  const b2 = Number.parseInt(hex2.slice(4, 6), 16);

  const red = Math.round(r1 + (r2 - r1) * t);
  const green = Math.round(g1 + (g2 - g1) * t);
  const blue = Math.round(b1 + (b2 - b1) * t);

  return `rgb(${red}, ${green}, ${blue})`;
};
