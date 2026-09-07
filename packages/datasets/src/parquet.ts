import { parquetMetadataAsync, parquetReadObjects, type AsyncBuffer } from "hyparquet";

import type { DatasetExample, Feature, FeatureSchema, ParquetReader } from "./types";

function parseHuggingFaceFeature(input: unknown): Feature {
  if (typeof input === "string") {
    if (input === "string") return { type: "string" };
    if (input === "binary") return { type: "binary" };
    if (input === "bool") return { type: "boolean" };
    if (/^(?:u?int|float)/u.test(input)) return { type: "number" };
    return { type: "unknown" };
  }
  if (!input || typeof input !== "object") return { type: "unknown" };
  const value = input as Record<string, unknown>;
  if (value._type === "ClassLabel" && Array.isArray(value.names)) {
    return {
      type: "classLabel",
      names: value.names.filter((name): name is string => typeof name === "string"),
    };
  }
  if (value._type === "Audio") {
    return {
      type: "audio",
      samplingRate: typeof value.sampling_rate === "number" ? value.sampling_rate : undefined,
    };
  }
  if (Array.isArray(input) && input.length > 0)
    return { type: "array", item: parseHuggingFaceFeature(input[0]) };
  return {
    type: "object",
    fields: Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, parseHuggingFaceFeature(child)]),
    ),
  };
}

function featuresFromMetadata(
  metadata: Awaited<ReturnType<typeof parquetMetadataAsync>>,
): FeatureSchema {
  const entry = metadata.key_value_metadata?.find((item) => item.key === "huggingface")?.value;
  if (entry) {
    try {
      const parsed = JSON.parse(entry) as { info?: { features?: Record<string, unknown> } };
      if (parsed.info?.features) {
        return Object.fromEntries(
          Object.entries(parsed.info.features).map(([key, value]) => [
            key,
            parseHuggingFaceFeature(value),
          ]),
        );
      }
    } catch {
      // Fall through to physical Parquet schema.
    }
  }
  return Object.fromEntries(
    metadata.schema.slice(1).map((element) => [
      element.name,
      {
        type:
          element.type === "BOOLEAN"
            ? "boolean"
            : element.type === "BYTE_ARRAY" &&
                (element.converted_type === "UTF8" || element.logical_type?.type === "STRING")
              ? "string"
              : element.type === "BYTE_ARRAY" || element.type === "FIXED_LEN_BYTE_ARRAY"
                ? "binary"
                : element.type
                  ? "number"
                  : "object",
      } as Feature,
    ]),
  );
}

let compressorPromise: Promise<typeof import("hyparquet-compressors")> | undefined;

async function getCompressors() {
  compressorPromise ??= import("hyparquet-compressors");
  return (await compressorPromise).compressors;
}

export const parquetReader: ParquetReader = {
  async metadata(file) {
    const metadata = await parquetMetadataAsync(file);
    return {
      examples: Number(metadata.num_rows),
      features: featuresFromMetadata(metadata),
      rowGroups: metadata.row_groups.map((rowGroup) => Number(rowGroup.num_rows)),
    };
  },
  async examples(file, options) {
    return (await parquetReadObjects({
      file,
      rowStart: options.start,
      rowEnd: options.end,
      columns: options.columns,
      compressors: await getCompressors(),
      utf8: false,
    })) as DatasetExample[];
  },
};

export function fileToAsyncBuffer(file: Blob): AsyncBuffer {
  return {
    byteLength: file.size,
    slice: (start, end) => file.slice(start, end).arrayBuffer(),
  };
}
