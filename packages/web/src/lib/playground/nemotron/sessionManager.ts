import * as ort from "onnxruntime-web";

type OpfsApi = typeof import("@memora/fs");

export const NEMOTRON_MODEL_ID = "onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4";
export const NEMOTRON_MODEL_REVISION = "8364d9e2dd9da23789b480bdbba9e423717e42ee";
export const NEMOTRON_CACHE_ROOT = "/nemotron-cache";

const MODEL_BASE_URL = `https://huggingface.co/${NEMOTRON_MODEL_ID}/resolve/${NEMOTRON_MODEL_REVISION}`;
const RESOURCE_NAMES = [
  "encoder.onnx",
  "encoder.onnx.data",
  "decoder.onnx",
  "decoder.onnx.data",
  "joint.onnx",
  "joint.onnx.data",
  "vocab.txt",
] as const;

type ResourceName = (typeof RESOURCE_NAMES)[number];
type EncoderDevice = "webgpu" | "wasm";

export interface NemotronDownloadProgress {
  file: ResourceName;
  loaded: number;
  total?: number;
  cached: boolean;
}

interface ResourceWriteProgress {
  loaded: number;
  total?: number;
}

interface SessionOptions {
  executionProviders: readonly ("webgpu" | "wasm")[];
  externalData: readonly { path: string; data: File }[];
}

type NemotronSession = ort.InferenceSession;

export interface NemotronSessions {
  encoder: NemotronSession;
  decoder: NemotronSession;
  joint: NemotronSession;
  encoderDevice: EncoderDevice;
  vocabulary: string[];
}

export interface NemotronSessionManagerDependencies {
  fetchResource: (url: string, init?: RequestInit) => Promise<Response>;
  readCachedFile: (path: string) => Promise<File | undefined>;
  writeCachedFile: (
    path: string,
    response: Response,
    onProgress?: (progress: ResourceWriteProgress) => void,
  ) => Promise<File>;
  createSession: (model: Uint8Array, options: SessionOptions) => Promise<NemotronSession>;
  hasWebGpu: () => boolean;
}

export interface LoadNemotronSessionsOptions {
  signal?: AbortSignal;
  onProgress?: (progress: NemotronDownloadProgress) => void;
}

export interface NemotronSessionManager {
  load(options?: LoadNemotronSessionsOptions): Promise<NemotronSessions>;
}

const resourcePath = (name: ResourceName) =>
  `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/${name}`;

const resourceUrl = (name: ResourceName) => `${MODEL_BASE_URL}/${name}`;

const defaultDependencies: NemotronSessionManagerDependencies = {
  fetchResource: (url, init) => fetch(url, init),
  readCachedFile: async (path) => {
    const { file } = (await import("@memora/fs")) satisfies OpfsApi;
    const cached = file(path);
    return (await cached.exists()) ? cached.getOriginFile() : undefined;
  },
  writeCachedFile: async (path, response, onProgress) => {
    const { file, writeStream } = (await import("@memora/fs")) satisfies OpfsApi;
    if (!response.body) throw new Error("Nemotron model response has no readable body.");
    const reader = response.body.getReader();
    const totalHeader = Number(response.headers.get("content-length"));
    const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
    let loaded = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await reader.read();
        if (next.done) {
          controller.close();
          return;
        }
        loaded += next.value.byteLength;
        onProgress?.({ loaded, total });
        controller.enqueue(next.value);
      },
      cancel: (reason) => reader.cancel(reason),
    });
    try {
      await writeStream(path, stream, { overwrite: true });
    } catch (error) {
      await file(path)
        .remove({ force: true })
        .catch(() => undefined);
      throw error;
    }
    return file(path).getOriginFile();
  },
  createSession: (model, options) => ort.InferenceSession.create(model, options),
  hasWebGpu: () => typeof navigator !== "undefined" && Boolean(navigator.gpu),
};

const loadResource = async (
  name: ResourceName,
  dependencies: NemotronSessionManagerDependencies,
  options: LoadNemotronSessionsOptions,
): Promise<File> => {
  options.signal?.throwIfAborted();
  const path = resourcePath(name);
  const cached = await dependencies.readCachedFile(path);
  if (cached) {
    options.onProgress?.({ file: name, loaded: cached.size, total: cached.size, cached: true });
    return cached;
  }

  const response = await dependencies.fetchResource(resourceUrl(name), { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Failed to download Nemotron ${name}: HTTP ${response.status}.`);
  }
  return dependencies.writeCachedFile(path, response, (progress) =>
    options.onProgress?.({ file: name, ...progress, cached: false }),
  );
};

const createModelSession = (
  model: File,
  externalData: File,
  executionProvider: EncoderDevice,
  dependencies: NemotronSessionManagerDependencies,
) =>
  model.arrayBuffer().then((buffer) =>
    dependencies.createSession(new Uint8Array(buffer), {
      executionProviders: [executionProvider],
      externalData: [{ path: `${model.name}.data`, data: externalData }],
    }),
  );

const performLoad = async (
  dependencies: NemotronSessionManagerDependencies,
  options: LoadNemotronSessionsOptions,
): Promise<NemotronSessions> => {
  const resources = new Map<ResourceName, File>();
  for (const name of RESOURCE_NAMES) {
    resources.set(name, await loadResource(name, dependencies, options));
  }
  const get = (name: ResourceName) => {
    const resource = resources.get(name);
    if (!resource) throw new Error(`Nemotron resource ${name} was not loaded.`);
    return resource;
  };

  let encoderDevice: EncoderDevice = dependencies.hasWebGpu() ? "webgpu" : "wasm";
  let encoder: NemotronSession;
  try {
    encoder = await createModelSession(
      get("encoder.onnx"),
      get("encoder.onnx.data"),
      encoderDevice,
      dependencies,
    );
  } catch (error) {
    if (encoderDevice !== "webgpu") throw error;
    encoderDevice = "wasm";
    encoder = await createModelSession(
      get("encoder.onnx"),
      get("encoder.onnx.data"),
      encoderDevice,
      dependencies,
    );
  }
  options.signal?.throwIfAborted();
  const decoder = await createModelSession(
    get("decoder.onnx"),
    get("decoder.onnx.data"),
    "wasm",
    dependencies,
  );
  options.signal?.throwIfAborted();
  const joint = await createModelSession(
    get("joint.onnx"),
    get("joint.onnx.data"),
    "wasm",
    dependencies,
  );
  const vocabulary = (await get("vocab.txt").text()).split(/\r?\n/).filter(Boolean);
  return { encoder, decoder, joint, encoderDevice, vocabulary };
};

export const createNemotronSessionManager = (
  dependencies: NemotronSessionManagerDependencies = defaultDependencies,
): NemotronSessionManager => {
  let loaded: Promise<NemotronSessions> | undefined;
  return {
    load(options = {}) {
      loaded ??= performLoad(dependencies, options).catch((error) => {
        loaded = undefined;
        throw error;
      });
      return loaded;
    },
  };
};

export const nemotronSessionManager = createNemotronSessionManager();
