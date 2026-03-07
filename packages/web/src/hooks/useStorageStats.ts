import { useCallback, useMemo, useState, useEffect } from "react";
import { dir as opfsDir } from "@memora/fs";
import { FILES_DIR } from "../lib/files";

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

export const STORAGE_CATEGORY_CONFIG = [
  { id: "recordings", label: "Recordings", color: "bg-rose-500" },
  { id: "transcripts", label: "Transcripts", color: "bg-orange-400" },
  { id: "models", label: "Models", color: "bg-amber-400" },
  { id: "text", label: "Text files", color: "bg-emerald-400" },
  { id: "images", label: "Images", color: "bg-indigo-400" },
  { id: "videos", label: "Videos", color: "bg-sky-500" },
] as const;

export type StorageCategoryId = (typeof STORAGE_CATEGORY_CONFIG)[number]["id"];

export type StorageCategory = {
  id: StorageCategoryId;
  label: string;
  color: string;
  size: number;
  fraction: number;
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
    if (child.kind === "file") {
      total += await child.getSize();
      continue;
    }

    total += await getDirectorySize(child.path);
  }
  return total;
};

const collectSizes = async (
  path: string,
  sizes: Record<StorageCategoryId, number>
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
    const size = await child.getSize();
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
  const sizes: Record<StorageCategoryId, number> = {
    recordings: 0,
    transcripts: 0,
    models: 0,
    text: 0,
    images: 0,
    videos: 0,
  };

  await collectSizes(FILES_DIR, sizes);
  sizes.models += await getDirectorySize("/transformers-cache");
  return sizes;
};

export const useStorageStats = (options?: { autoRefresh?: boolean }) => {
  const [storageUsage, setStorageUsage] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [isStoragePersistent, setIsStoragePersistent] = useState(false);
  const [isStorageSupported, setIsStorageSupported] = useState(true);
  const [categorySizes, setCategorySizes] = useState<
    Record<StorageCategoryId, number>
  >({
    recordings: 0,
    transcripts: 0,
    models: 0,
    text: 0,
    images: 0,
    videos: 0,
  });

  const refreshStorageState = useCallback(async () => {
    if (!navigator.storage?.estimate) {
      setIsStorageSupported(false);
      return;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const persisted = await navigator.storage.persisted?.();
      const breakdown = await getStorageBreakdown();

      setStorageUsage(estimate.usage ?? 0);
      setStorageQuota(estimate.quota ?? 0);
      setIsStoragePersistent(Boolean(persisted));
      setIsStorageSupported(true);
      setCategorySizes(breakdown);
    } catch {
      setIsStorageSupported(false);
    }
  }, []);

  const autoRefresh = options?.autoRefresh ?? true;

  useEffect(() => {
    if (!autoRefresh) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStorageState();
  }, [autoRefresh, refreshStorageState]);

  const categories = useMemo(() => {
    const total = STORAGE_CATEGORY_CONFIG.reduce(
      (sum, category) => sum + (categorySizes[category.id] ?? 0),
      0
    );
    const fallbackFraction = STORAGE_CATEGORY_CONFIG.length
      ? 1 / STORAGE_CATEGORY_CONFIG.length
      : 1;

    return STORAGE_CATEGORY_CONFIG.map((category) => {
      const size = categorySizes[category.id] ?? 0;
      const fraction = total ? size / total : fallbackFraction;
      return {
        ...category,
        size,
        fraction,
      };
    });
  }, [categorySizes]);

  return {
    storageUsage,
    storageQuota,
    isStoragePersistent,
    isStorageSupported,
    categories,
    refreshStorageState,
    autoRefresh,
  };
};
