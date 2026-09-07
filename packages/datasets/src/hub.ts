import {
  datasetInfo,
  downloadFile,
  fileDownloadInfo,
  globMatch,
  listFiles,
} from "@huggingface/hub";
import { asyncBufferFromUrl } from "hyparquet";

import { DatasetError, toDatasetError } from "./errors";
import { parquetReader } from "./parquet";
import type {
  DatasetConfigurationInspection,
  DatasetFile,
  DatasetInspection,
  DatasetSource,
  FeatureSchema,
} from "./types";

interface HubSourceOptions {
  fetch?: typeof fetch;
  hubUrl?: string;
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  visit: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const item = items[index++];
        await visit(item);
      }
    }),
  );
}

function withSignal(
  fetchImplementation: typeof fetch | undefined,
  signal: AbortSignal | undefined,
): typeof fetch {
  const baseFetch = fetchImplementation ?? fetch;
  return (input, init) => baseFetch(input, { ...init, signal: signal ?? init?.signal });
}

function inferLocation(path: string): { configuration: string; split: string } | undefined {
  const parquetData = /^parquet-data\/([^/]+)\/([^/]+)\/.*\.parquet$/u.exec(path);
  if (parquetData) return { configuration: parquetData[1], split: parquetData[2] };
  const parquetDataFile = /^parquet-data\/([^/]+)\/([^/]+?)(?:-\d+-of-\d+)?\.parquet$/u.exec(path);
  if (parquetDataFile) return { configuration: parquetDataFile[1], split: parquetDataFile[2] };
  const directory = /^(?:data\/)?([^/]+)\/([^/]+?)(?:-\d+-of-\d+)?\.parquet$/u.exec(path);
  if (directory) return { configuration: directory[1], split: directory[2] };
  const root = /^(?:data\/)?([^/]+?)(?:-\d+-of-\d+)?\.parquet$/u.exec(path);
  if (root) return { configuration: "default", split: root[1] };
  return undefined;
}

interface DeclaredFile {
  configuration: string;
  split: string;
  pattern: string;
}

function declaredFiles(
  configs:
    | Array<{
        config_name: string;
        data_files?: string | string[] | Array<{ split: string; path: string | string[] }>;
      }>
    | undefined,
): DeclaredFile[] {
  const declarations: DeclaredFile[] = [];
  for (const config of configs ?? []) {
    if (!Array.isArray(config.data_files)) continue;
    for (const dataFile of config.data_files) {
      if (typeof dataFile === "string") continue;
      for (const pattern of Array.isArray(dataFile.path) ? dataFile.path : [dataFile.path]) {
        declarations.push({ configuration: config.config_name, split: dataFile.split, pattern });
      }
    }
  }
  return declarations;
}

export function createHuggingFaceSource(options: HubSourceOptions = {}): DatasetSource {
  return {
    async inspect(datasetId, requestedRevision, signal) {
      try {
        const requestFetch = withSignal(options.fetch, signal);
        const info = await datasetInfo({
          name: datasetId,
          revision: requestedRevision,
          additionalFields: ["sha", "cardData"],
          hubUrl: options.hubUrl,
          fetch: requestFetch,
        });
        if (!info.sha)
          throw new DatasetError("unsupported", "The Hub did not return an immutable revision.");
        const declarations = declaredFiles(info.cardData?.configs);
        const grouped = new Map<
          string,
          Map<string, { files: DatasetFile[]; features: FeatureSchema }>
        >();
        for await (const entry of listFiles({
          repo: { type: "dataset", name: datasetId },
          revision: info.sha,
          recursive: true,
          hubUrl: options.hubUrl,
          fetch: requestFetch,
        })) {
          if (entry.type !== "file" || !entry.path.endsWith(".parquet")) continue;
          const declared = declarations.find(({ pattern }) => globMatch(pattern, entry.path));
          const location = declared ?? inferLocation(entry.path);
          if (!location) continue;
          const configurations = grouped.get(location.configuration) ?? new Map();
          const split = configurations.get(location.split) ?? { files: [], features: {} };
          split.files.push({
            path: entry.path,
            size: entry.lfs?.size ?? entry.size,
            etag: entry.oid,
          });
          configurations.set(location.split, split);
          grouped.set(location.configuration, configurations);
        }
        if (grouped.size === 0)
          throw new DatasetError(
            "unsupported",
            "No supported declarative Parquet files were found.",
          );
        const repo = { type: "dataset" as const, name: datasetId };
        const inspectionFiles = [...grouped.values()].flatMap((splits) =>
          [...splits.values()].flatMap((split) =>
            split.files.map((datasetFile) => ({ datasetFile, split })),
          ),
        );
        await mapConcurrent(inspectionFiles, 6, async ({ datasetFile, split }) => {
          signal?.throwIfAborted();
          const downloadInfo = await fileDownloadInfo({
            repo,
            path: datasetFile.path,
            revision: info.sha,
            hubUrl: options.hubUrl,
            fetch: requestFetch,
          });
          if (!downloadInfo)
            throw new DatasetError("network", `Dataset file disappeared: ${datasetFile.path}`);
          // Only the Parquet footer is read here (hyparquet issues ranged HTTP reads),
          // not the full file body, so inspecting a repo with hundreds of shards stays cheap.
          const buffer = await asyncBufferFromUrl({
            url: downloadInfo.url,
            byteLength: datasetFile.size,
            fetch: requestFetch,
          });
          const metadata = await parquetReader.metadata(buffer);
          datasetFile.examples = metadata.examples;
          if (Object.keys(split.features).length === 0) split.features = metadata.features;
        });
        const configurations: DatasetConfigurationInspection[] = [...grouped.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, splits]) => {
            const inspectedSplits = [...splits.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([splitName, split]) => ({
                name: splitName,
                examples: split.files.every((item) => item.examples !== undefined)
                  ? split.files.reduce((sum, item) => sum + (item.examples ?? 0), 0)
                  : undefined,
                size: split.files.reduce((sum, item) => sum + item.size, 0),
                files: split.files.sort((a, b) => a.path.localeCompare(b.path)),
                features: split.features,
              }));
            return {
              name,
              size: inspectedSplits.reduce((sum, split) => sum + split.size, 0),
              splits: inspectedSplits,
            };
          });
        return {
          source: "huggingface",
          datasetId,
          requestedRevision,
          revision: info.sha,
          configurations,
        } satisfies DatasetInspection;
      } catch (error) {
        throw toDatasetError(error, "network");
      }
    },
    async download(datasetFile, selection, signal) {
      try {
        signal?.throwIfAborted();
        const blob = await downloadFile({
          repo: { type: "dataset", name: selection.datasetId },
          path: datasetFile.path,
          revision: selection.revision,
          hubUrl: options.hubUrl,
          fetch: withSignal(options.fetch, signal),
          xet: false,
        });
        if (!blob)
          throw new DatasetError("network", `Dataset file disappeared: ${datasetFile.path}`);
        return blob.stream();
      } catch (error) {
        throw toDatasetError(error, "network");
      }
    },
  };
}
