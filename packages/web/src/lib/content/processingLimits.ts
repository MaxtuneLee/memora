export interface ContentProcessingLimits {
  maxFileBytes: number;
  maxPdfPages: number;
  maxImagePixels: number;
  maxPptxUncompressedBytes: number;
  maxDurationMs: number;
}

export const DEFAULT_CONTENT_PROCESSING_LIMITS: ContentProcessingLimits = {
  maxFileBytes: 100 * 1024 * 1024,
  maxPdfPages: 500,
  maxImagePixels: 40_000_000,
  maxPptxUncompressedBytes: 200 * 1024 * 1024,
  maxDurationMs: 15 * 60 * 1000,
};

export const assertContentFileSize = (
  file: Pick<File, "name" | "size">,
  limits: ContentProcessingLimits = DEFAULT_CONTENT_PROCESSING_LIMITS,
): void => {
  if (file.size > limits.maxFileBytes) {
    throw new Error(
      `${file.name} exceeds the ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB processing limit.`,
    );
  }
};

export const createProcessingBudget = (
  limits: ContentProcessingLimits = DEFAULT_CONTENT_PROCESSING_LIMITS,
  now: () => number = () => performance.now(),
) => {
  const startedAt = now();
  return {
    check: () => {
      if (now() - startedAt > limits.maxDurationMs) {
        throw new Error("Content processing exceeded the time limit.");
      }
    },
  };
};
