import { builtInLocalModelManifests, getLocalModelManifest } from "@memora/local-model-runtime";
import type { LocalModelManifest } from "@memora/local-model-runtime";
import { dir as opfsDir, file as opfsFile, ls as opfsLs, write as opfsWrite } from "@memora/fs";

const TRANSFORMERS_CACHE_DIR = "/transformers-cache";
const CACHE_MARKER_FILE_NAME = ".memora-cache-state.json";

interface LocalModelCacheMarkerFile {
  path: string;
  size: number;
}

interface LocalModelCacheMarker {
  version: 1;
  modelId: string;
  manifestModelId: string;
  completedAt: string;
  totalBytes: number;
  files: LocalModelCacheMarkerFile[];
}

export interface LocalModelOption {
  id: string;
  name: string;
  manifest: LocalModelManifest;
}

export interface LocalModelCacheStatus {
  modelId: string;
  cached: boolean;
  fileCount: number;
  totalBytes?: number;
}

const getManifestCachePath = (manifest: Pick<LocalModelManifest, "modelId">): string => {
  return `${TRANSFORMERS_CACHE_DIR}/${manifest.modelId}`;
};

const getLocalModelCacheMarkerPath = (manifest: Pick<LocalModelManifest, "modelId">): string => {
  return `${getManifestCachePath(manifest)}/${CACHE_MARKER_FILE_NAME}`;
};

const toRelativeCachePath = (cachePath: string, filePath: string): string => {
  return filePath.slice(`${cachePath}/`.length);
};

const isMarkerFilePath = (path: string): boolean => {
  return path.endsWith(`/${CACHE_MARKER_FILE_NAME}`);
};

const listLocalModelCacheFiles = async (cachePath: string): Promise<string[]> => {
  const files = await opfsLs(cachePath, {
    recursive: true,
    includeFiles: true,
    includeDirs: false,
  });
  return files.filter((path) => !isMarkerFilePath(path)).sort();
};

const readLocalModelCacheMarker = async (
  manifest: LocalModelManifest,
): Promise<LocalModelCacheMarker | null> => {
  const markerPath = getLocalModelCacheMarkerPath(manifest);
  const markerFile = opfsFile(markerPath);
  if (!(await markerFile.exists())) {
    return null;
  }

  try {
    const parsed = JSON.parse(await markerFile.text()) as Partial<LocalModelCacheMarker>;
    if (
      parsed.version !== 1 ||
      parsed.modelId !== manifest.id ||
      parsed.manifestModelId !== manifest.modelId ||
      !Array.isArray(parsed.files) ||
      parsed.files.length === 0
    ) {
      return null;
    }

    const files = parsed.files
      .filter(
        (entry): entry is LocalModelCacheMarkerFile =>
          typeof entry?.path === "string" &&
          !!entry.path &&
          typeof entry.size === "number" &&
          Number.isFinite(entry.size) &&
          entry.size >= 0,
      )
      .sort((left, right) => left.path.localeCompare(right.path));
    if (files.length === 0) {
      return null;
    }

    return {
      version: 1,
      modelId: manifest.id,
      manifestModelId: manifest.modelId,
      completedAt:
        typeof parsed.completedAt === "string" && parsed.completedAt
          ? parsed.completedAt
          : new Date(0).toISOString(),
      totalBytes:
        typeof parsed.totalBytes === "number" && Number.isFinite(parsed.totalBytes)
          ? parsed.totalBytes
          : files.reduce((sum, file) => sum + file.size, 0),
      files,
    };
  } catch {
    return null;
  }
};

const hasCompleteLocalModelCache = async (
  manifest: LocalModelManifest,
  marker: LocalModelCacheMarker,
): Promise<boolean> => {
  const cachePath = getManifestCachePath(manifest);
  for (const expectedFile of marker.files) {
    const absolutePath = `${cachePath}/${expectedFile.path}`;
    const currentFile = opfsFile(absolutePath);
    if (!(await currentFile.exists())) {
      return false;
    }

    try {
      if ((await currentFile.getSize()) !== expectedFile.size) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
};

export const clearLocalModelCacheMarker = async (modelId: string): Promise<void> => {
  const manifest = getLocalModelManifest(modelId);
  if (!manifest) return;
  await opfsFile(getLocalModelCacheMarkerPath(manifest)).remove({ force: true });
};

export const writeLocalModelCacheMarker = async (modelId: string): Promise<void> => {
  const manifest = getLocalModelManifest(modelId);
  if (!manifest) {
    throw new Error(`Local model ${modelId} was not found.`);
  }

  const cachePath = getManifestCachePath(manifest);
  const files = await listLocalModelCacheFiles(cachePath);
  if (files.length === 0) {
    throw new Error(`Local model ${modelId} has no cached files to mark as complete.`);
  }

  const markerFiles = await Promise.all(
    files.map(async (path) => ({
      path: toRelativeCachePath(cachePath, path),
      size: await opfsFile(path).getSize(),
    })),
  );

  const marker: LocalModelCacheMarker = {
    version: 1,
    modelId: manifest.id,
    manifestModelId: manifest.modelId,
    completedAt: new Date().toISOString(),
    totalBytes: markerFiles.reduce((sum, file) => sum + file.size, 0),
    files: markerFiles,
  };

  await opfsWrite(getLocalModelCacheMarkerPath(manifest), JSON.stringify(marker), {
    overwrite: true,
  });
};

export const getLocalChatModelOptions = (): LocalModelOption[] => {
  return builtInLocalModelManifests
    .filter((manifest) => manifest.task === "chat")
    .map((manifest) => ({
      id: manifest.id,
      name: manifest.displayName,
      manifest,
    }));
};

export const getLocalModelOptions = (): LocalModelOption[] => {
  return builtInLocalModelManifests.map((manifest) => ({
    id: manifest.id,
    name: manifest.displayName,
    manifest,
  }));
};

export const getRequiredOnboardingModelOptions = (): LocalModelOption[] => {
  const requiredIds = new Set(["gemma-4-e2b-it-onnx", "whisper-base-timestamped"]);
  return getLocalModelOptions().filter((model) => requiredIds.has(model.id));
};

export const getLocalModelCacheStatus = async (modelId: string): Promise<LocalModelCacheStatus> => {
  const manifest = getLocalModelManifest(modelId);
  if (!manifest) {
    return { modelId, cached: false, fileCount: 0 };
  }

  const cachePath = getManifestCachePath(manifest);
  try {
    if (!(await opfsDir(cachePath).exists())) {
      return { modelId, cached: false, fileCount: 0 };
    }

    const files = await listLocalModelCacheFiles(cachePath);
    const marker = await readLocalModelCacheMarker(manifest);
    const cached = marker ? await hasCompleteLocalModelCache(manifest, marker) : false;

    return {
      modelId,
      cached,
      fileCount: files.length,
      ...(cached && marker ? { totalBytes: marker.totalBytes } : {}),
    };
  } catch {
    return { modelId, cached: false, fileCount: 0 };
  }
};
