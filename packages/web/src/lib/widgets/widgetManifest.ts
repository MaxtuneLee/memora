import type { BuiltinWidgetKey, DataSourceName, WidgetKind } from "@/livestore/widget";

export const WIDGET_MANIFEST_FILE_NAME = "widget.json";
export const WIDGET_MANIFEST_MIME_TYPE = "application/json";
export const WIDGET_SOURCE_FILE_NAME = "widget.html";
export const WIDGET_SOURCE_MIME_TYPE = "text/html";

export interface WidgetManifest {
  kind: WidgetKind;
  builtinKey?: BuiltinWidgetKey;
  name: string;
  dataSourceName: DataSourceName;
  dataSourceParams: Record<string, unknown>;
  // File names this Definition is allowed to write under its own data/ folder via writeData
  // (see ADR 0008). Undefined/empty means the Definition has declared no data files, so every
  // writeData call is refused.
  dataFiles?: readonly string[];
}

export const buildWidgetManifest = (input: {
  kind: WidgetKind;
  builtinKey?: BuiltinWidgetKey | null;
  name: string;
  dataSourceName: DataSourceName;
  dataSourceParams?: Record<string, unknown>;
  dataFiles?: readonly string[];
}): WidgetManifest => ({
  kind: input.kind,
  ...(input.builtinKey ? { builtinKey: input.builtinKey } : {}),
  name: input.name,
  dataSourceName: input.dataSourceName,
  dataSourceParams: input.dataSourceParams ?? {},
  ...(input.dataFiles && input.dataFiles.length > 0 ? { dataFiles: input.dataFiles } : {}),
});

export const serializeWidgetManifest = (manifest: WidgetManifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`;
