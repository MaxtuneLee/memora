import type { LocalModelCacheStatus } from "@/lib/local-model/status";

export interface LocalModelDownloadFileState {
  file: string;
  progress: number;
  total?: number;
}

export interface LocalModelDownloadState {
  status: "idle" | "checking" | "cached" | "not-cached" | "downloading" | "error";
  progress?: number;
  file?: string;
  files?: LocalModelDownloadFileState[];
  total?: number;
  error?: string;
  cache?: LocalModelCacheStatus;
}

interface LocalModelProgressEvent {
  file?: string;
  progress?: number;
  total?: number;
}

const isFinitePositiveNumber = (value: number | undefined): value is number => {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
};

const clampProgress = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
};

const getKnownFileTotalBytes = (state?: LocalModelDownloadState): number => {
  return (state?.files ?? []).reduce((sum, fileState) => {
    return isFinitePositiveNumber(fileState.total) ? sum + fileState.total : sum;
  }, 0);
};

export const getLocalModelDownloadTotalBytes = (
  state?: LocalModelDownloadState,
  fallbackTotalBytes?: number,
): number | undefined => {
  const totals = [getKnownFileTotalBytes(state), state?.total, fallbackTotalBytes].filter(
    isFinitePositiveNumber,
  );
  if (totals.length === 0) return undefined;
  return Math.max(...totals);
};

export const getLocalModelDownloadedBytes = (
  state?: LocalModelDownloadState,
  fallbackTotalBytes?: number,
): number => {
  const totalBytes = getLocalModelDownloadTotalBytes(state, fallbackTotalBytes);
  if (state?.status === "cached") {
    return totalBytes ?? 0;
  }

  const downloadedBytes = (state?.files ?? []).reduce((sum, fileState) => {
    if (!isFinitePositiveNumber(fileState.total)) return sum;
    return sum + fileState.total * (clampProgress(fileState.progress) / 100);
  }, 0);
  if (downloadedBytes > 0) {
    return totalBytes ? Math.min(downloadedBytes, totalBytes) : downloadedBytes;
  }

  if (!isFinitePositiveNumber(totalBytes)) return 0;
  return totalBytes * (clampProgress(state?.progress) / 100);
};

export const getLocalModelDownloadProgress = (
  state?: LocalModelDownloadState,
  fallbackTotalBytes?: number,
): number => {
  if (state?.status === "cached") return 100;

  const totalBytes = getLocalModelDownloadTotalBytes(state, fallbackTotalBytes);
  const downloadedBytes = getLocalModelDownloadedBytes(state, fallbackTotalBytes);
  if (isFinitePositiveNumber(totalBytes) && downloadedBytes > 0) {
    return clampProgress((downloadedBytes / totalBytes) * 100);
  }

  return clampProgress(state?.progress);
};

export const applyLocalModelProgressEvent = (
  state: LocalModelDownloadState,
  event: LocalModelProgressEvent,
): LocalModelDownloadState => {
  const nextProgress =
    typeof event.progress === "number" && Number.isFinite(event.progress)
      ? clampProgress(event.progress)
      : state.progress;

  if (!event.file) {
    return {
      ...state,
      status: "downloading",
      progress: nextProgress,
      total: event.total ?? state.total,
    };
  }

  const files = state.files ? [...state.files] : [];
  const existingIndex = files.findIndex((item) => item.file === event.file);
  const nextFileState: LocalModelDownloadFileState = {
    file: event.file,
    progress: nextProgress ?? 0,
    ...(event.total !== undefined ? { total: event.total } : {}),
  };

  if (existingIndex >= 0) {
    files[existingIndex] = {
      ...files[existingIndex],
      ...nextFileState,
    };
  } else {
    files.push(nextFileState);
  }

  const knownFileTotal = files.reduce((sum, fileState) => {
    return typeof fileState.total === "number" && Number.isFinite(fileState.total)
      ? sum + fileState.total
      : sum;
  }, 0);

  return {
    ...state,
    status: "downloading",
    progress: nextProgress,
    file: event.file,
    files,
    total: knownFileTotal > 0 ? knownFileTotal : (event.total ?? state.total),
  };
};
