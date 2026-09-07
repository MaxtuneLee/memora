import * as v from "valibot";

import type { DatasetFile, FeatureSchema, InstalledDataset } from "./types";

const FeatureSchemaValue: v.GenericSchema = v.lazy(() =>
  v.variant("type", [
    v.object({ type: v.picklist(["boolean", "number", "string", "binary", "unknown"]) }),
    v.object({ type: v.literal("classLabel"), names: v.array(v.string()) }),
    v.object({ type: v.literal("audio"), samplingRate: v.optional(v.number()) }),
    v.object({ type: v.literal("object"), fields: v.record(v.string(), FeatureSchemaValue) }),
    v.object({ type: v.literal("array"), item: FeatureSchemaValue }),
  ]),
);

const FileSchema = v.object({
  path: v.string(),
  size: v.number(),
  etag: v.optional(v.string()),
  examples: v.optional(v.number()),
});

const ManifestSchema = v.object({
  format: v.literal(1),
  source: v.literal("huggingface"),
  datasetId: v.string(),
  revision: v.string(),
  configuration: v.string(),
  split: v.string(),
  size: v.number(),
  examples: v.optional(v.number()),
  installedAt: v.string(),
  features: v.record(v.string(), FeatureSchemaValue),
  files: v.array(FileSchema),
});

export interface InstallationManifest extends InstalledDataset {
  format: 1;
  features: FeatureSchema;
  files: DatasetFile[];
}

export function parseManifest(input: unknown): InstallationManifest {
  return v.parse(ManifestSchema, input) as InstallationManifest;
}
