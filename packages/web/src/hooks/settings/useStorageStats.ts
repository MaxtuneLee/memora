import { dir as opfsDir } from "@memora/fs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FILES_DIR } from "@/types/library";

const AUDIO_EXTENSIONS = new Set([
  ".webm",
  ".wav",
  ".mp3",
  ".m4a",
  ".ogg",
  ".flac",
  ".mpeg"
]);

const TRANSCRIPT_EXTENSIONS = new Set([".json", ".transcript.json"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".rtf"]);
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".heic",
]);
const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".qt",
  ".m4v",
  ".mkv",
  ".avi",
  ".quicktime",
]);

const SKIP_DIRS = new Set([
  "/.opfs-tools-temp-dir",
  "/livestore-devtools_0.3.1_main@4",
  "/livestore-main@4",
]);

export const STORAGE_CONTENT_CATEGORY_CONFIG = [
  { id: "recordings", label: "Recordings", color: "bg-[#b07a63]" },
  { id: "transcripts", label: "Transcripts", color: "bg-[#c39a5b]" },
  { id: "models", label: "Models", color: "bg-[#879a4f]" },
  { id: "text", label: "Text files", color: "bg-[#6f7d63]" },
  { id: "images", label: "Images", color: "bg-[#9b8d7a]" },
  { id: "videos", label: "Videos", color: "bg-[#7c6f64]" },
] as const;

const STORAGE_BREAKDOWN_SEGMENT_CONFIG = [
  { id: "user-content", label: "User content", color: "bg-zinc-900" },
  { id: "internal-data", label: "Internal data", color: "bg-zinc-500" },
  { id: "browser-cache", label: "Browser cache", color: "bg-[#c39a5b]" },
  { id: "service-workers", label: "Service workers", color: "bg-[#879a4f]" },
  { id: "other", label: "Other", color: "bg-[#8c7b6a]" },
  {
    id: "unclassified-storage",
    label: "Unclassified storage",
    color: "bg-[#a39584]",
  },
] as const;

export type StorageContentCategoryId =
  (typeof STORAGE_CONTENT_CATEGORY_CONFIG)[number]["id"];

export type StorageBreakdownSegmentId =
  (typeof STORAGE_BREAKDOWN_SEGMENT_CONFIG)[number]["id"];

export interface StorageMetricSegment {
  label: string;
  color: string;
  size: number;
  fraction: number;
}

export interface StorageContentCategory extends StorageMetricSegment {
  id: StorageContentCategoryId;
}

export interface StorageBreakdownSegment extends StorageMetricSegment {
  id: StorageBreakdownSegmentId;
}

interface StorageUsageDetails {
  caches?: number;
  fileSystem?: number;
  serviceWorkerRegistrations?: number;
}

type StorageEstimateWithUsageDetails = StorageEstimate & {
  usageDetails?: StorageUsageDetails;
};

interface StorageStatsSnapshot {
  storageUsage: number;
  storageQuota: number;
  isStoragePersistent: boolean;
  isStorageSupported: boolean;
  contentCategorySizes: Record<StorageContentCategoryId, number>;
  storageUsageDetails?: StorageUsageDetails;
}

const createEmptyCategorySizes = (): Record<StorageContentCategoryId, number> => ({
  recordings: 0,
  transcripts: 0,
  models: 0,
  text: 0,
  images: 0,
  videos: 0,
});

const createInitialStorageStatsSnapshot = (): StorageStatsSnapshot => ({
  storageUsage: 0,
  storageQuota: 0,
  isStoragePersistent: false,
  isStorageSupported: true,
  contentCategorySizes: createEmptyCategorySizes(),
  storageUsageDetails: undefined,
});

let sharedStorageStatsSnapshot = createInitialStorageStatsSnapshot();

const storageStatsListeners = new Set<
  (snapshot: StorageStatsSnapshot) => void
>();

const publishStorageStatsSnapshot = (snapshot: StorageStatsSnapshot): void => {
  sharedStorageStatsSnapshot = snapshot;
  storageStatsListeners.forEach((listener) => {
    listener(snapshot);
  });
};

const toNonNegativeNumber = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
};

const buildUsagePercentageLabel = (
  storageUsage: number,
  storageQuota: number,
): string => {
  if (!storageQuota || !storageUsage) {
    return "0%";
  }

  const percentage = (storageUsage / storageQuota) * 100;
  if (percentage > 0 && percentage < 1) {
    return "<1%";
  }

  return `${Math.min(100, Math.round(percentage))}%`;
};

const buildMetricSegments = <TId extends string>(
  config: readonly { id: TId; label: string; color: string }[],
  sizes: Record<TId, number>,
): Array<{
  label: string;
  color: string;
  size: number;
  fraction: number;
  id: TId;
}> => {
  const total = config.reduce((sum, segment) => {
    return sum + (sizes[segment.id] ?? 0);
  }, 0);

  return config.map((segment) => {
    const size = sizes[segment.id] ?? 0;
    return {
      ...segment,
      size,
      fraction: total > 0 ? size / total : 0,
    };
  });
};

const getExtension = (name: string) => {
  const match = name.match(/\.([^\s;]+)/);
  const ext = match ? "." + match[1] : ""; // ".webm"
  return ext.toLowerCase();
};

const shouldSkipDir = (path: string) =>
  Array.from(SKIP_DIRS).some(
    (dir) => path === dir || path.startsWith(`${dir}/`)
  );

const getDirectorySize = async (path: string) => {
  const directory = opfsDir(path);
  const exists = await directory.exists();
  if (!exists) return 0;

  let total = 0;
  const children = await directory.children();
  for (const child of children) {
    if (child.kind === "file" && child.getSize) {
      total += await child.getSize();
      continue;
    }

    total += await getDirectorySize(child.path);
  }
  return total;
};

const collectSizes = async (
  path: string,
  sizes: Record<StorageContentCategoryId, number>,
) => {
  const directory = opfsDir(path);
  const exists = await directory.exists();
  if (!exists) return;

  const children = await directory.children();
  for (const child of children) {
    if (child.kind === "dir") {
      if (shouldSkipDir(child.path)) continue;
      await collectSizes(child.path, sizes);
      continue;
    }

    const ext = getExtension(child.name);
    const size = child.getSize ? await child.getSize() : 0;
    if (AUDIO_EXTENSIONS.has(ext)) {
      sizes.recordings += size;
    } else if (TRANSCRIPT_EXTENSIONS.has(ext)) {
      sizes.transcripts += size;
    } else if (VIDEO_EXTENSIONS.has(ext)) {
      sizes.videos += size;
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      sizes.images += size;
    } else if (TEXT_EXTENSIONS.has(ext)) {
      sizes.text += size;
    }
  }
};

const getStorageBreakdown = async () => {
  const sizes = createEmptyCategorySizes();

  await collectSizes(FILES_DIR, sizes);
  sizes.models += await getDirectorySize("/transformers-cache");
  return sizes;
};

const buildBreakdownSegmentSizes = ({
  contentUsage,
  storageUsage,
  usageDetails,
}: {
  contentUsage: number;
  storageUsage: number;
  usageDetails?: StorageUsageDetails;
}): Record<StorageBreakdownSegmentId, number> => {
  const totalUsage = toNonNegativeNumber(storageUsage);
  const normalizedContentUsage = toNonNegativeNumber(contentUsage);

  if (!usageDetails) {
    return {
      "user-content": normalizedContentUsage,
      "internal-data": 0,
      "browser-cache": 0,
      "service-workers": 0,
      other: 0,
      "unclassified-storage": Math.max(
        0,
        totalUsage - normalizedContentUsage,
      ),
    };
  }

  const fileSystemUsage = toNonNegativeNumber(usageDetails.fileSystem);
  const browserCacheUsage = toNonNegativeNumber(usageDetails.caches);
  const serviceWorkerUsage = toNonNegativeNumber(
    usageDetails.serviceWorkerRegistrations,
  );
  const internalDataUsage = Math.max(
    0,
    fileSystemUsage - normalizedContentUsage,
  );
  const knownUsage =
    normalizedContentUsage +
    internalDataUsage +
    browserCacheUsage +
    serviceWorkerUsage;

  return {
    "user-content": normalizedContentUsage,
    "internal-data": internalDataUsage,
    "browser-cache": browserCacheUsage,
    "service-workers": serviceWorkerUsage,
    other: Math.max(0, totalUsage - knownUsage),
    "unclassified-storage": 0,
  };
};

export const useStorageStats = (options?: { autoRefresh?: boolean }) => {
  const [snapshot, setSnapshot] = useState(sharedStorageStatsSnapshot);

  const refreshStorageState = useCallback(async () => {
    if (!navigator.storage?.estimate) {
      publishStorageStatsSnapshot({
        ...sharedStorageStatsSnapshot,
        isStorageSupported: false,
        storageUsageDetails: undefined,
      });
      return;
    }

    try {
      const estimate =
        (await navigator.storage.estimate()) as StorageEstimateWithUsageDetails;
      const persisted = await navigator.storage.persisted?.();
      const breakdown = await getStorageBreakdown();

      publishStorageStatsSnapshot({
        storageUsage: toNonNegativeNumber(estimate.usage),
        storageQuota: toNonNegativeNumber(estimate.quota),
        storageUsageDetails: estimate.usageDetails,
        isStoragePersistent: Boolean(persisted),
        isStorageSupported: true,
        contentCategorySizes: breakdown,
      });
    } catch {
      publishStorageStatsSnapshot({
        ...sharedStorageStatsSnapshot,
        isStorageSupported: false,
        storageUsageDetails: undefined,
      });
    }
  }, []);

  const autoRefresh = options?.autoRefresh ?? true;

  useEffect(() => {
    storageStatsListeners.add(setSnapshot);

    return () => {
      storageStatsListeners.delete(setSnapshot);
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    void refreshStorageState();
  }, [autoRefresh, refreshStorageState]);

  const contentCategories = useMemo(() => {
    return buildMetricSegments(
      STORAGE_CONTENT_CATEGORY_CONFIG,
      snapshot.contentCategorySizes,
    ) as StorageContentCategory[];
  }, [snapshot.contentCategorySizes]);
  const contentUsage = useMemo(() => {
    return contentCategories.reduce((sum, category) => sum + category.size, 0);
  }, [contentCategories]);
  const breakdownSegments = useMemo(() => {
    return buildMetricSegments(
      STORAGE_BREAKDOWN_SEGMENT_CONFIG,
      buildBreakdownSegmentSizes({
        contentUsage,
        storageUsage: snapshot.storageUsage,
        usageDetails: snapshot.storageUsageDetails,
      }),
    ) as StorageBreakdownSegment[];
  }, [contentUsage, snapshot.storageUsage, snapshot.storageUsageDetails]);
  const usagePercentageLabel = useMemo(() => {
    return buildUsagePercentageLabel(snapshot.storageUsage, snapshot.storageQuota);
  }, [snapshot.storageQuota, snapshot.storageUsage]);

  return {
    storageUsage: snapshot.storageUsage,
    storageQuota: snapshot.storageQuota,
    isStoragePersistent: snapshot.isStoragePersistent,
    isStorageSupported: snapshot.isStorageSupported,
    breakdownSegments,
    contentCategories,
    contentUsage,
    usagePercentageLabel,
    refreshStorageState,
    autoRefresh,
  };
};
