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
}

export const buildWidgetManifest = (input: {
  kind: WidgetKind;
  builtinKey?: BuiltinWidgetKey | null;
  name: string;
  dataSourceName: DataSourceName;
  dataSourceParams?: Record<string, unknown>;
}): WidgetManifest => ({
  kind: input.kind,
  ...(input.builtinKey ? { builtinKey: input.builtinKey } : {}),
  name: input.name,
  dataSourceName: input.dataSourceName,
  dataSourceParams: input.dataSourceParams ?? {},
});

export const serializeWidgetManifest = (manifest: WidgetManifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`;
