import type { LocalModelManifest } from "@memora/local-model-runtime";

type OpfsApi = typeof import("@memora/fs");

const TRANSFORMERS_CACHE_ROOT = "/transformers-cache";

export const getTransformersModelCachePath = (manifest: Pick<LocalModelManifest, "modelId">) => {
  return `${TRANSFORMERS_CACHE_ROOT}/${manifest.modelId}`;
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

class OPFSCache {
  static async match(request: string): Promise<Response | undefined> {
    const { file } = (await import("@memora/fs")) satisfies OpfsApi;
    const url = new URL(request);
    const opfsPath = `${TRANSFORMERS_CACHE_ROOT}${url.pathname}`;

    try {
      if (await file(opfsPath).exists()) {
        const data = await file(opfsPath).arrayBuffer();
        return new Response(data, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
    } catch (error) {
      console.warn("OPFS cache match error:", error);
    }

    return undefined;
  }

  static async put(request: string, response: Response): Promise<void> {
    const { dir, write } = (await import("@memora/fs")) satisfies OpfsApi;
    const url = new URL(request);
    const opfsPath = `${TRANSFORMERS_CACHE_ROOT}${url.pathname}`;

    if (!response.ok) {
      return;
    }

    try {
      const dirPath = opfsPath.substring(0, opfsPath.lastIndexOf("/"));
      await dir(dirPath).create();
      const arrayBuffer = await response.clone().arrayBuffer();
      await write(opfsPath, arrayBuffer, { overwrite: true });
    } catch (error) {
      console.error("OPFS cache put error:", error);
    }
  }
}

export const configureTransformersCache = (transformersEnv: {
  useCustomCache: boolean;
  customCache: unknown;
}): void => {
  transformersEnv.useCustomCache = true;
  transformersEnv.customCache = OPFSCache;
};
