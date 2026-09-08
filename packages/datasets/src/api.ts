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

function resolveDatasetDependencies(options: DatasetOptions = {}) {
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
  return resolveDatasetDependencies(options).source.inspect(
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

export async function resolveDatasetSplit(
  inspection: DatasetInspection,
  configuration: string,
  splitName: string,
  options: DatasetOptions & { signal?: AbortSignal } = {},
): Promise<DatasetInspection> {
  const { source } = resolveDatasetDependencies(options);
  const split = findSplit(inspection, configuration, splitName);
  if (split.examples !== undefined) return inspection;
  const resolved = await source.resolveSplit(
    inspection.datasetId,
    inspection.revision,
    split,
    options.signal,
  );
  return {
    ...inspection,
    configurations: inspection.configurations.map((item) =>
      item.name !== configuration
        ? item
        : {
            ...item,
            splits: item.splits.map((candidate) =>
              candidate.name === splitName ? resolved : candidate,
            ),
          },
    ),
  };
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

async function shardMetadata(
  storage: DatasetStorage,
  reader: ParquetReader,
  selection: DatasetSelection,
  index: number,
  expectedSize: number,
): Promise<Awaited<ReturnType<ParquetReader["metadata"]>> | undefined> {
  const path = shardPath(selection, index);
  if (!(await storage.exists(path)) || (await storage.size(path)) !== expectedSize)
    return undefined;
  try {
    return await reader.metadata(fileToAsyncBuffer(await storage.readFile(path)));
  } catch {
    return undefined;
  }
}

async function verifyShard(
  storage: DatasetStorage,
  reader: ParquetReader,
  selection: DatasetSelection,
  index: number,
  expectedSize: number,
): Promise<boolean> {
  return (await shardMetadata(storage, reader, selection, index, expectedSize)) !== undefined;
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
  const { storage, source, reader } = resolveDatasetDependencies(options);
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
      const shardsMetadata = await Promise.all(
        split.files.map((file, index) =>
          shardMetadata(storage, reader, selection, index, file.size),
        ),
      );
      const reusableFiles = shardsMetadata.map((metadata) => metadata !== undefined);
      const requiredBytes = split.files.reduce(
        (total, file, index) => total + (reusableFiles[index] ? 0 : file.size),
        0,
      );
      const estimate = await storage.estimate?.();
      const available =
        estimate?.quota === undefined ? undefined : estimate.quota - (estimate.usage ?? 0);
      if (available !== undefined && available < requiredBytes)
        throw new DatasetError(
          "quota",
          `This installation needs ${requiredBytes} bytes, but only ${Math.max(0, available)} bytes are available.`,
        );
      await storage.remove(manifestPath(selection)).catch(() => undefined);
      let completedBytes = 0;
      for (const [index, datasetFile] of split.files.entries()) {
        options.signal?.throwIfAborted();
        if (reusableFiles[index]) {
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
          const metadata = await shardMetadata(storage, reader, selection, index, datasetFile.size);
          if (!metadata)
            throw new DatasetError(
              "network",
              `Downloaded file failed validation: ${datasetFile.path}`,
            );
          shardsMetadata[index] = metadata;
        } catch (error) {
          await storage.remove(localPath).catch(() => undefined);
          throw error;
        }
        completedBytes += datasetFile.size;
      }
      // Example counts and features are read from the shards on disk, not from
      // inspection: inspect() only lists files, it never reads Parquet footers.
      const resolvedFeatures =
        shardsMetadata.find((metadata) => metadata && Object.keys(metadata.features).length > 0)
          ?.features ?? split.features;
      const resolvedExamples = shardsMetadata.reduce(
        (sum, metadata) => sum + (metadata?.examples ?? 0),
        0,
      );
      const installed: InstallationManifest = {
        format: 1,
        source: "huggingface",
        ...selection,
        size: split.size,
        examples: resolvedExamples,
        installedAt: new Date().toISOString(),
        features: resolvedFeatures,
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
  const bytes = candidate.bytes;
  if (!ArrayBuffer.isView(bytes) && !(bytes instanceof ArrayBuffer) && !Array.isArray(bytes))
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
    bytes: ArrayBuffer.isView(bytes)
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : Uint8Array.from(bytes),
    path,
    mimeType,
  };
}

export async function openDataset<T extends DatasetExample = DatasetExample>(
  selection: DatasetSelection,
  options: DatasetOptions = {},
): Promise<Dataset<T>> {
  const { storage, reader } = resolveDatasetDependencies(options);
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
      const metadata = await reader.metadata(file);
      const length = datasetFile.examples ?? metadata.examples;
      const windows = metadata.rowGroups?.length ? metadata.rowGroups : undefined;
      let start = 0;
      for (const windowSize of windows ??
        Array.from({ length: Math.ceil(length / READ_WINDOW) }, () => READ_WINDOW)) {
        const end = Math.min(start + windowSize, length);
        const rows = await reader.examples(file, {
          start,
          end,
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
        start = end;
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
  const { storage } = resolveDatasetDependencies(options);
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
  await resolveDatasetDependencies(options).storage.remove(root, { recursive: true });
}
