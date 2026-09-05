import { DatasetError, toDatasetError } from "./errors";
import { createHuggingFaceSource } from "./hub";
import { parseManifest, type InstallationManifest } from "./manifest";
import { fileToAsyncBuffer, parquetReader } from "./parquet";
import { opfsDatasetStorage } from "./storage";
import type {
  Dataset,
  DatasetExample,
  DatasetInspection,
  DatasetOptions,
  DatasetSelection,
  DatasetStorage,
  EncodedMedia,
  InstallProgress,
  InstalledDataset,
  MediaReference,
  ParquetReader,
} from "./types";

const STORAGE_ROOT = "/memora/datasets/huggingface";
const READ_WINDOW = 64;
const activeDatasets = new Map<string, number>();
const safeSegment = (value: string) => encodeURIComponent(value);
const installationRoot = (selection: DatasetSelection) =>
  `${STORAGE_ROOT}/${safeSegment(selection.datasetId)}/${safeSegment(selection.revision)}/${safeSegment(selection.configuration)}/${safeSegment(selection.split)}`;
const manifestPath = (selection: DatasetSelection) =>
  `${installationRoot(selection)}/manifest.json`;
const shardPath = (selection: DatasetSelection, index: number) =>
  `${installationRoot(selection)}/shards/${String(index).padStart(5, "0")}.parquet`;

function dependencies(options: DatasetOptions = {}) {
  return {
    storage: options.storage ?? opfsDatasetStorage,
    source: options.source ?? createHuggingFaceSource(),
    reader: options.reader ?? parquetReader,
  };
}

export async function inspectDataset(
  datasetId: string,
  options: DatasetOptions & { revision?: string; signal?: AbortSignal } = {},
): Promise<DatasetInspection> {
  if (!datasetId.trim() || !datasetId.includes("/"))
    throw new DatasetError("unsupported", "Enter a public Hub dataset ID such as google/fleurs.");
  return dependencies(options).source.inspect(
    datasetId.trim(),
    options.revision ?? "main",
    options.signal,
  );
}

function findSplit(inspection: DatasetInspection, configuration: string, split: string) {
  const selected = inspection.configurations
    .find((item) => item.name === configuration)
    ?.splits.find((item) => item.name === split);
  if (!selected)
    throw new DatasetError("unsupported", `Unknown dataset selection: ${configuration}/${split}`);
  return selected;
}

async function readManifest(
  storage: DatasetStorage,
  selection: DatasetSelection,
): Promise<InstallationManifest> {
  if (!(await storage.exists(manifestPath(selection))))
    throw new DatasetError("not-installed", "The selected dataset split is not installed.");
  try {
    return parseManifest(JSON.parse(await storage.readText(manifestPath(selection))));
  } catch (error) {
    throw new DatasetError("invalid-manifest", "The installed dataset description is invalid.", {
      cause: error,
    });
  }
}

async function verifyShard(
  storage: DatasetStorage,
  reader: ParquetReader,
  selection: DatasetSelection,
  index: number,
  expectedSize: number,
): Promise<boolean> {
  const path = shardPath(selection, index);
  if (!(await storage.exists(path)) || (await storage.size(path)) !== expectedSize) return false;
  try {
    await reader.metadata(fileToAsyncBuffer(await storage.readFile(path)));
    return true;
  } catch {
    return false;
  }
}

function progressStream(
  stream: ReadableStream<Uint8Array>,
  file: string,
  fileSize: number,
  completedBefore: number,
  totalBytes: number,
  onProgress?: (progress: InstallProgress) => void,
) {
  let fileBytes = 0;
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        fileBytes += chunk.byteLength;
        onProgress?.({
          file,
          fileBytes,
          fileSize,
          completedBytes: completedBefore + fileBytes,
          totalBytes,
        });
        controller.enqueue(chunk);
      },
    }),
  );
}

export async function installDataset(
  inspection: DatasetInspection,
  options: DatasetOptions & {
    configuration: string;
    splits: string[];
    signal?: AbortSignal;
    onProgress?: (progress: InstallProgress) => void;
  },
): Promise<InstalledDataset[]> {
  const { storage, source, reader } = dependencies(options);
  const results: InstalledDataset[] = [];
  for (const splitName of options.splits) {
    const split = findSplit(inspection, options.configuration, splitName);
    const selection: DatasetSelection = {
      datasetId: inspection.datasetId,
      revision: inspection.revision,
      configuration: options.configuration,
      split: splitName,
    };
    try {
      options.signal?.throwIfAborted();
      const existing = await readManifest(storage, selection).catch(() => undefined);
      if (
        existing &&
        (
          await Promise.all(
            existing.files.map((file, index) =>
              verifyShard(storage, reader, selection, index, file.size),
            ),
          )
        ).every(Boolean)
      ) {
        results.push(existing);
        continue;
      }
      const estimate = await storage.estimate?.();
      const available =
        estimate?.quota === undefined ? undefined : estimate.quota - (estimate.usage ?? 0);
      if (available !== undefined && available < split.size)
        throw new DatasetError(
          "quota",
          `This split needs ${split.size} bytes, but only ${Math.max(0, available)} bytes are available.`,
        );
      await storage.remove(manifestPath(selection)).catch(() => undefined);
      let completedBytes = 0;
      for (const [index, datasetFile] of split.files.entries()) {
        options.signal?.throwIfAborted();
        if (await verifyShard(storage, reader, selection, index, datasetFile.size)) {
          completedBytes += datasetFile.size;
          options.onProgress?.({
            file: datasetFile.path,
            fileBytes: datasetFile.size,
            fileSize: datasetFile.size,
            completedBytes,
            totalBytes: split.size,
          });
          continue;
        }
        const localPath = shardPath(selection, index);
        await storage.remove(localPath).catch(() => undefined);
        try {
          const stream = await source.download(datasetFile, selection, options.signal);
          await storage.write(
            localPath,
            progressStream(
              stream,
              datasetFile.path,
              datasetFile.size,
              completedBytes,
              split.size,
              options.onProgress,
            ),
          );
          if (!(await verifyShard(storage, reader, selection, index, datasetFile.size)))
            throw new DatasetError(
              "network",
              `Downloaded file failed validation: ${datasetFile.path}`,
            );
        } catch (error) {
          await storage.remove(localPath).catch(() => undefined);
          throw error;
        }
        completedBytes += datasetFile.size;
      }
      const installed: InstallationManifest = {
        format: 1,
        source: "huggingface",
        ...selection,
        size: split.size,
        examples: split.examples,
        installedAt: new Date().toISOString(),
        features: split.features,
        files: split.files,
      };
      await storage.write(manifestPath(selection), JSON.stringify(installed));
      results.push(installed);
    } catch (error) {
      throw toDatasetError(error, "network");
    }
  }
  return results;
}

const mediaFields = (manifest: InstallationManifest) =>
  Object.entries(manifest.features)
    .filter(([, feature]) => feature.type === "audio")
    .map(([name]) => name);
function encodedMedia(value: unknown): EncodedMedia {
  if (!value || typeof value !== "object")
    throw new DatasetError("unsupported", "The media value is missing.");
  const candidate = value as { bytes?: unknown; path?: unknown };
  if (!(candidate.bytes instanceof Uint8Array) && !(candidate.bytes instanceof ArrayBuffer))
    throw new DatasetError("unsupported", "The media value does not contain encoded bytes.");
  const path = typeof candidate.path === "string" ? candidate.path : undefined;
  const extension = path?.split(".").pop()?.toLowerCase();
  const mimeType =
    extension === "wav"
      ? "audio/wav"
      : extension === "mp3"
        ? "audio/mpeg"
        : extension === "flac"
          ? "audio/flac"
          : undefined;
  return {
    bytes:
      candidate.bytes instanceof Uint8Array ? candidate.bytes : new Uint8Array(candidate.bytes),
    path,
    mimeType,
  };
}

export async function openDataset<T extends DatasetExample = DatasetExample>(
  selection: DatasetSelection,
  options: DatasetOptions = {},
): Promise<Dataset<T>> {
  const { storage, reader } = dependencies(options);
  const manifest = await readManifest(storage, selection);
  if (
    !(
      await Promise.all(
        manifest.files.map((file, index) =>
          verifyShard(storage, reader, selection, index, file.size),
        ),
      )
    ).every(Boolean)
  )
    throw new DatasetError("not-installed", "The selected dataset installation is incomplete.");
  const root = installationRoot(selection);
  activeDatasets.set(root, (activeDatasets.get(root) ?? 0) + 1);
  let closed = false;
  const audioFields = mediaFields(manifest);
  const columns = Object.keys(manifest.features).filter((field) => !audioFields.includes(field));
  async function* iterate(): AsyncGenerator<T> {
    if (closed) throw new DatasetError("in-use", "This dataset handle is closed.");
    for (const [shard, datasetFile] of manifest.files.entries()) {
      const file = fileToAsyncBuffer(await storage.readFile(shardPath(selection, shard)));
      const length = datasetFile.examples ?? (await reader.metadata(file)).examples;
      for (let start = 0; start < length; start += READ_WINDOW) {
        const rows = await reader.examples(file, {
          start,
          end: Math.min(start + READ_WINDOW, length),
          columns,
        });
        for (const [offset, row] of rows.entries()) {
          const example = { ...row };
          for (const field of audioFields)
            example[field] = {
              type: "media",
              mediaType: "audio",
              field,
              shard,
              example: start + offset,
              samplingRate:
                manifest.features[field].type === "audio"
                  ? manifest.features[field].samplingRate
                  : undefined,
            } satisfies MediaReference;
          yield example as T;
        }
      }
    }
  }
  return {
    selection,
    features: manifest.features,
    length: manifest.examples,
    [Symbol.asyncIterator]: iterate,
    async *batches(size, batchOptions) {
      if (!Number.isInteger(size) || size <= 0)
        throw new RangeError("Batch size must be a positive integer.");
      let batch: T[] = [];
      for await (const example of iterate()) {
        batch.push(example);
        if (batch.length === size) {
          yield batch;
          batch = [];
        }
      }
      if (batch.length > 0 && !batchOptions?.dropLast) yield batch;
    },
    async readMedia(reference) {
      if (closed) throw new DatasetError("in-use", "This dataset handle is closed.");
      if (reference.mediaType !== "audio" || !audioFields.includes(reference.field))
        throw new DatasetError(
          "unsupported",
          "This media reference does not belong to the dataset.",
        );
      const file = fileToAsyncBuffer(await storage.readFile(shardPath(selection, reference.shard)));
      const rows = await reader.examples(file, {
        start: reference.example,
        end: reference.example + 1,
        columns: [reference.field],
      });
      return encodedMedia(rows[0]?.[reference.field]);
    },
    close() {
      if (closed) return;
      closed = true;
      const remaining = (activeDatasets.get(root) ?? 1) - 1;
      if (remaining > 0) activeDatasets.set(root, remaining);
      else activeDatasets.delete(root);
    },
  };
}

export async function loadDataset<T extends DatasetExample = DatasetExample>(
  request: DatasetSelection | (Omit<DatasetSelection, "revision"> & { revision?: string }),
  options: DatasetOptions & {
    signal?: AbortSignal;
    onProgress?: (progress: InstallProgress) => void;
  } = {},
): Promise<Dataset<T>> {
  const inspection = await inspectDataset(request.datasetId, {
    ...options,
    revision: request.revision,
    signal: options.signal,
  });
  const selection = { ...request, revision: inspection.revision };
  await installDataset(inspection, {
    ...options,
    configuration: request.configuration,
    splits: [request.split],
    signal: options.signal,
    onProgress: options.onProgress,
  });
  return openDataset<T>(selection, options);
}

export async function listInstalledDatasets(
  options: DatasetOptions = {},
): Promise<InstalledDataset[]> {
  const { storage } = dependencies(options);
  const installed: InstalledDataset[] = [];
  for (const path of (await storage.list(STORAGE_ROOT)).filter((candidate) =>
    candidate.endsWith("/manifest.json"),
  )) {
    try {
      installed.push(parseManifest(JSON.parse(await storage.readText(path))));
    } catch {
      /* Partial installations stay hidden. */
    }
  }
  return installed.sort((a, b) => b.installedAt.localeCompare(a.installedAt));
}

export async function deleteInstalledDataset(
  selection: DatasetSelection,
  options: DatasetOptions = {},
): Promise<void> {
  const root = installationRoot(selection);
  if ((activeDatasets.get(root) ?? 0) > 0)
    throw new DatasetError("in-use", "Close the dataset before deleting its installed files.");
  await dependencies(options).storage.remove(root, { recursive: true });
}
