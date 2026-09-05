import type { AsyncBuffer } from "hyparquet";

export type PrimitiveFeatureType = "boolean" | "number" | "string" | "binary" | "unknown";

export type Feature =
  | { type: PrimitiveFeatureType }
  | { type: "classLabel"; names: string[] }
  | { type: "audio"; samplingRate?: number }
  | { type: "object"; fields: Record<string, Feature> }
  | { type: "array"; item: Feature };

export type FeatureSchema = Record<string, Feature>;

export interface DatasetFile {
  path: string;
  size: number;
  etag?: string;
  examples?: number;
}

export interface DatasetSplitInspection {
  name: string;
  examples?: number;
  size: number;
  files: DatasetFile[];
  features: FeatureSchema;
}

export interface DatasetConfigurationInspection {
  name: string;
  size: number;
  splits: DatasetSplitInspection[];
}

export interface DatasetInspection {
  source: "huggingface";
  datasetId: string;
  requestedRevision: string;
  revision: string;
  configurations: DatasetConfigurationInspection[];
}

export interface DatasetSelection {
  datasetId: string;
  revision: string;
  configuration: string;
  split: string;
}

export interface InstallProgress {
  file: string;
  fileBytes: number;
  fileSize: number;
  completedBytes: number;
  totalBytes: number;
}

export interface InstalledDataset extends DatasetSelection {
  source: "huggingface";
  size: number;
  examples?: number;
  installedAt: string;
}

export interface MediaReference {
  type: "media";
  mediaType: "audio";
  field: string;
  shard: number;
  example: number;
  path?: string;
  samplingRate?: number;
}

export interface EncodedMedia {
  bytes: Uint8Array;
  path?: string;
  mimeType?: string;
}

export type DatasetExample = Record<string, unknown>;

export interface Dataset<T extends DatasetExample = DatasetExample> extends AsyncIterable<T> {
  readonly selection: DatasetSelection;
  readonly features: FeatureSchema;
  readonly length?: number;
  batches(size: number, options?: { dropLast?: boolean }): AsyncIterable<T[]>;
  readMedia(reference: MediaReference): Promise<EncodedMedia>;
  close(): void;
}

export interface DatasetStorage {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  readFile(path: string): Promise<File>;
  size(path: string): Promise<number>;
  write(path: string, data: string | ReadableStream<Uint8Array>): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  list(path: string): Promise<string[]>;
  estimate?(): Promise<{ quota?: number; usage?: number }>;
}

export interface DatasetSource {
  inspect(datasetId: string, revision: string, signal?: AbortSignal): Promise<DatasetInspection>;
  download(
    file: DatasetFile,
    selection: DatasetSelection,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
}

export interface ParquetReader {
  metadata(file: AsyncBuffer): Promise<{ examples: number; features: FeatureSchema }>;
  examples(
    file: AsyncBuffer,
    options: { start: number; end: number; columns?: string[] },
  ): Promise<DatasetExample[]>;
}

export interface DatasetOptions {
  storage?: DatasetStorage;
  source?: DatasetSource;
  reader?: ParquetReader;
}
