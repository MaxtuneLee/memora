import type { LocalModelAssetCache } from "./storage";
import type { LocalModelManifest } from "./types";

type TransformersFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type TransformersFetchEnvironment = {
  useCustomCache: boolean;
  customCache: unknown;
  useBrowserCache?: boolean;
  fetch?: TransformersFetch;
};

const pendingFetches = new Map<string, Promise<Response>>();
const originalFetchByEnvironment = new WeakMap<object, TransformersFetch>();
let assetCache: LocalModelAssetCache | null = null;

export const setLocalModelAssetCache = (cache: LocalModelAssetCache): void => {
  assetCache = cache;
};

const getAssetCache = (): LocalModelAssetCache => {
  if (!assetCache) throw new Error("Local model asset cache has not been configured.");
  return assetCache;
};

export const clearTransformersModelCache = async (
  manifest: Pick<LocalModelManifest, "modelId">,
): Promise<void> => {
  await getAssetCache().removeModel(manifest);
};

export const isTransformersExternalDataCacheError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Deserialize tensor") &&
    message.includes("external data file") &&
    message.includes("Out of bounds")
  );
};

export const isTransformersModelCacheCorruptionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    isTransformersExternalDataCacheError(error) ||
    message.includes("No graph was found in the protobuf")
  );
};

class RuntimeAssetCache {
  static match(request: string): Promise<Response | undefined> {
    return getAssetCache().match(request);
  }

  static put(request: string, response: Response): Promise<void> {
    return getAssetCache().put(request, response);
  }
}

const getRequestUrl = (input: string | URL): string => {
  return typeof input === "string" ? input : input.href;
};

const shouldBypassCache = (init?: RequestInit): boolean => {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  return method !== "GET" || headers.has("range");
};

const createCachingFetch = (nativeFetch: TransformersFetch): TransformersFetch => {
  return async (input, init) => {
    if (shouldBypassCache(init)) return nativeFetch(input, init);

    const request = getRequestUrl(input);
    const cache = getAssetCache();
    const cached = await cache.match(request);
    if (cached) return cached;

    const pending = pendingFetches.get(request);
    if (pending) {
      const response = await pending;
      return (await cache.match(request)) ?? response.clone();
    }

    const download = (async () => {
      const response = await nativeFetch(input, init);
      if (!response.ok || !response.body) return response;
      await cache.put(request, response.clone());
      return response;
    })();
    pendingFetches.set(request, download);
    try {
      const response = await download;
      return (await cache.match(request)) ?? response;
    } finally {
      pendingFetches.delete(request);
    }
  };
};

export const configureTransformersCache = (environment: TransformersFetchEnvironment): void => {
  environment.useCustomCache = true;
  environment.customCache = RuntimeAssetCache;
  if ("useBrowserCache" in environment) environment.useBrowserCache = false;
  if (!environment.fetch) return;

  const originalFetch = originalFetchByEnvironment.get(environment) ?? environment.fetch;
  if (!originalFetchByEnvironment.has(environment)) {
    originalFetchByEnvironment.set(environment, originalFetch);
    environment.fetch = createCachingFetch(originalFetch);
  }
};
