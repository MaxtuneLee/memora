import type { LocalModelManifest } from "@memora/local-model-runtime";

type OpfsApi = typeof import("@memora/fs");

export const LOCAL_MODEL_CACHE_ROOT = "/transformers-cache";

export interface ModelResourceDownloadProgress {
  loaded: number;
  total?: number;
}

export interface CachedModelResource {
  file: File;
  path: string;
  cached: boolean;
}

const pendingModelResources = new Map<string, Promise<CachedModelResource>>();
type TransformersFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

const originalFetchByEnvironment = new WeakMap<object, TransformersFetch>();

export const getModelResourceCachePath = (request: string): string => {
  const url = new URL(request);
  return `${LOCAL_MODEL_CACHE_ROOT}${url.pathname}`;
};

export const getTransformersModelCachePath = (manifest: Pick<LocalModelManifest, "modelId">) => {
  return `${LOCAL_MODEL_CACHE_ROOT}/${manifest.modelId}`;
};

export const clearTransformersModelCache = async (
  manifest: Pick<LocalModelManifest, "modelId">,
): Promise<void> => {
  const { rm } = await import("@memora/fs");
  await rm(getTransformersModelCachePath(manifest), {
    recursive: true,
    force: true,
  });
};

export const isTransformersExternalDataCacheError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Deserialize tensor") &&
    message.includes("external data file") &&
    message.includes("Out of bounds")
  );
};

export class OPFSCache {
  private static async has(request: string): Promise<boolean> {
    const { file } = (await import("@memora/fs")) satisfies OpfsApi;
    return file(getModelResourceCachePath(request)).exists();
  }

  static async match(request: string): Promise<Response | undefined> {
    const { file } = (await import("@memora/fs")) satisfies OpfsApi;
    const opfsPath = getModelResourceCachePath(request);

    try {
      const cachedFile = file(opfsPath);
      if (await cachedFile.exists()) {
        const source = await cachedFile.getOriginFile();
        return new Response(source.stream(), {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": source.size.toString(),
          },
        });
      }
    } catch (error) {
      console.warn("OPFS cache match error:", error);
    }

    return undefined;
  }

  private static async writeResponseBody(request: string, response: Response): Promise<void> {
    const { file, writeStream } = (await import("@memora/fs")) satisfies OpfsApi;
    const opfsPath = getModelResourceCachePath(request);

    if (!response.ok) {
      return;
    }

    if (await file(opfsPath).exists()) {
      return;
    }
    const body = response.body;
    if (!body) {
      throw new Error("Model response does not expose a readable stream.");
    }
    await writeStream(opfsPath, body, { overwrite: true });
  }

  static async put(request: string, response: Response): Promise<void> {
    try {
      if (await OPFSCache.has(request)) {
        return;
      }
      await OPFSCache.writeResponseBody(request, response.clone());
    } catch (error) {
      console.error("OPFS cache put error:", error);
    }
  }

  static async cacheResponse(request: string, response: Response): Promise<void> {
    await OPFSCache.writeResponseBody(request, response);
  }
}

type TransformersFetchEnvironment = {
  useCustomCache: boolean;
  customCache: unknown;
  useBrowserCache?: boolean;
  fetch?: TransformersFetch;
};

const getRequestUrl = (input: string | URL): string => {
  if (typeof input === "string") return input;
  return input.href;
};

const shouldBypassOpfsCache = (init?: RequestInit): boolean => {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  return method !== "GET" || headers.has("range");
};

const createOpfsCachingFetch = (nativeFetch: TransformersFetch): TransformersFetch => {
  return async (input, init) => {
    if (shouldBypassOpfsCache(init)) {
      return nativeFetch(input, init);
    }

    const request = getRequestUrl(input);
    const cached = await OPFSCache.match(request);
    if (cached) return cached;

    const response = await nativeFetch(input, init);
    if (!response.ok || !response.body) return response;

    await OPFSCache.cacheResponse(request, response);
    return (await OPFSCache.match(request)) ?? response;
  };
};

const withProgress = (
  stream: ReadableStream<Uint8Array>,
  onProgress: ((progress: ModelResourceDownloadProgress) => void) | undefined,
  total: number | undefined,
): ReadableStream<Uint8Array> => {
  const reader = stream.getReader();
  let loaded = 0;
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
};

const downloadModelResource = async (
  request: string,
  onProgress?: (progress: ModelResourceDownloadProgress) => void,
): Promise<CachedModelResource> => {
  const { file, writeStream } = (await import("@memora/fs")) satisfies OpfsApi;
  const path = getModelResourceCachePath(request);
  const cachedFile = file(path);
  if (await cachedFile.exists()) {
    return { file: await cachedFile.getOriginFile(), path, cached: true };
  }

  const response = await fetch(request);
  if (!response.ok) {
    throw new Error(`Failed to download model resource: HTTP ${response.status}`);
  }

  const totalHeader = Number(response.headers.get("content-length"));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
  if (!response.body) {
    throw new Error("Model response does not expose a readable stream.");
  }
  await writeStream(path, withProgress(response.body, onProgress, total), { overwrite: true });
  return { file: await file(path).getOriginFile(), path, cached: false };
};

export const ensureOpfsModelResource = async (
  request: string,
  onProgress?: (progress: ModelResourceDownloadProgress) => void,
): Promise<CachedModelResource> => {
  const pending = pendingModelResources.get(request);
  if (pending) return pending;
  const download = downloadModelResource(request, onProgress).finally(() => {
    pendingModelResources.delete(request);
  });
  pendingModelResources.set(request, download);
  return download;
};

export const createOpfsModelResourceUrl = async (
  request: string,
  onProgress?: (progress: ModelResourceDownloadProgress) => void,
): Promise<{ url: string; path: string; cached: boolean }> => {
  const resource = await ensureOpfsModelResource(request, onProgress);
  return {
    url: URL.createObjectURL(resource.file),
    path: resource.path,
    cached: resource.cached,
  };
};

export const configureTransformersCache = (transformersEnv: TransformersFetchEnvironment): void => {
  transformersEnv.useCustomCache = true;
  transformersEnv.customCache = OPFSCache;
  if ("useBrowserCache" in transformersEnv) transformersEnv.useBrowserCache = false;
  if (!transformersEnv.fetch) return;

  const originalFetch = originalFetchByEnvironment.get(transformersEnv) ?? transformersEnv.fetch;
  if (!originalFetchByEnvironment.has(transformersEnv)) {
    originalFetchByEnvironment.set(transformersEnv, originalFetch);
    transformersEnv.fetch = createOpfsCachingFetch(originalFetch);
  }
};
