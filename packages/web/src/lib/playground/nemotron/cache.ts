import {
  dir as opfsDir,
  file as opfsFile,
  rm as opfsRm,
  write as opfsWrite,
  writeStream as opfsWriteStream,
} from "@memora/fs";

export const NEMOTRON_MODEL_ID = "onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4";
export const NEMOTRON_MODEL_REVISION = "8364d9e2dd9da23789b480bdbba9e423717e42ee";
export const NEMOTRON_CACHE_ROOT = "/nemotron-cache";

const MODEL_BASE_URL = `https://huggingface.co/${NEMOTRON_MODEL_ID}/resolve/${NEMOTRON_MODEL_REVISION}`;

export const NEMOTRON_RESOURCE_NAMES = [
  "encoder.onnx",
  "encoder.onnx.data",
  "decoder.onnx",
  "decoder.onnx.data",
  "joint.onnx",
  "joint.onnx.data",
  "vocab.txt",
] as const;

export type NemotronResourceName = (typeof NEMOTRON_RESOURCE_NAMES)[number];

export interface NemotronResourceProgress {
  file: NemotronResourceName;
  loaded: number;
  total?: number;
  cached: boolean;
}

export interface NemotronCacheStatus {
  cached: boolean;
  totalBytes: number;
}

export const getNemotronResourcePath = (name: NemotronResourceName): string =>
  `${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}/${name}`;

const getNemotronResourceUrl = (name: NemotronResourceName): string => `${MODEL_BASE_URL}/${name}`;

const isCompleteNemotronResource = async (path: string): Promise<boolean> => {
  const resource = opfsFile(path);
  const complete = opfsFile(`${path}.complete`);
  return (await resource.exists()) && (await complete.exists());
};

const writeNemotronResource = async (
  path: string,
  response: Response,
  onProgress?: (progress: { loaded: number; total?: number }) => void,
): Promise<void> => {
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
    await opfsWriteStream(path, stream, { overwrite: true });
    if (total !== undefined && loaded !== total) {
      throw new Error(
        `Incomplete Nemotron model download: expected ${total} bytes, received ${loaded}.`,
      );
    }
    await opfsWrite(`${path}.complete`, String(loaded), { overwrite: true });
  } catch (error) {
    await Promise.all([
      opfsFile(path)
        .remove({ force: true })
        .catch(() => undefined),
      opfsFile(`${path}.complete`)
        .remove({ force: true })
        .catch(() => undefined),
    ]);
    throw error;
  }
};

export const downloadNemotronCache = async (options?: {
  signal?: AbortSignal;
  onProgress?: (progress: NemotronResourceProgress) => void;
  fetchResource?: (url: string, init?: RequestInit) => Promise<Response>;
}): Promise<void> => {
  const fetchResource = options?.fetchResource ?? fetch;

  for (const name of NEMOTRON_RESOURCE_NAMES) {
    options?.signal?.throwIfAborted();
    const path = getNemotronResourcePath(name);
    if (await isCompleteNemotronResource(path)) {
      const size = await opfsFile(path).getSize();
      options?.onProgress?.({ file: name, loaded: size, total: size, cached: true });
      continue;
    }

    const response = await fetchResource(getNemotronResourceUrl(name), { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`Failed to download Nemotron ${name}: HTTP ${response.status}.`);
    }

    await writeNemotronResource(path, response, (progress) =>
      options?.onProgress?.({ file: name, ...progress, cached: false }),
    );
  }
};

export const getNemotronCacheStatus = async (): Promise<NemotronCacheStatus> => {
  const root = opfsDir(`${NEMOTRON_CACHE_ROOT}/${NEMOTRON_MODEL_REVISION}`);
  if (!(await root.exists())) {
    return { cached: false, totalBytes: 0 };
  }

  let totalBytes = 0;
  let cached = true;
  for (const name of NEMOTRON_RESOURCE_NAMES) {
    const path = getNemotronResourcePath(name);
    if (!(await isCompleteNemotronResource(path))) {
      cached = false;
      continue;
    }
    totalBytes += await opfsFile(path).getSize();
  }

  return { cached, totalBytes };
};

export const clearNemotronCache = async (): Promise<void> => {
  await opfsRm(NEMOTRON_CACHE_ROOT, { recursive: true, force: true });
};
