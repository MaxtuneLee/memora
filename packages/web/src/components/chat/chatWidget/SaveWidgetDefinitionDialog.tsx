import { useCallback, useEffect, useId, useRef, useState, type JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import { NativeDialog } from "@/components/ui/NativeDialog";
import { DataSourceParamsFields } from "@/components/widgets/DataSourceParamsFields";
import type { DataSourceName } from "@/livestore/widget";
import {
  DATA_SOURCE_CATALOG,
  getDataSourceCatalogEntry,
  getDefaultDataSourceParams,
  parseDataSourceParamValues,
  stringifyDataSourceParamValues,
  validateDataSourceParamValues,
} from "@/lib/widgets/dataSourceCatalog";
import type {
  SaveChatWidgetDefinitionInput,
  SaveChatWidgetDefinitionResult,
} from "@/lib/widgets/saveChatWidgetDefinition";

const styles = stylex.create({
  panel: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 20,
    boxShadow: "0 24px 48px rgb(43 39 32 / 0.16)",
    padding: 24,
    width: "min(460px, 92vw)",
  },
  content: { display: "flex", flexDirection: "column", gap: 20 },
  heading: { color: "var(--color-memora-text-strong)", fontSize: 20, fontWeight: 600, margin: 0 },
  description: {
    color: "var(--color-memora-text-muted)",
    fontSize: 14,
    lineHeight: 1.5,
    marginBlock: 6,
    marginInline: 0,
  },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  label: { color: "var(--color-memora-text)", fontSize: 14, fontWeight: 600 },
  select: {
    backgroundColor: "var(--color-memora-surface-soft)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 10,
    color: "var(--color-memora-text)",
    fontSize: 14,
    minHeight: 40,
    paddingBlock: 8,
    paddingInline: 10,
    ":focus-visible": { outline: "2px solid var(--color-memora-olive-soft)", outlineOffset: 2 },
  },
  sourceDescription: {
    color: "var(--color-memora-text-muted)",
    fontSize: 13,
    lineHeight: 1.45,
    margin: 0,
  },
  error: {
    backgroundColor: "var(--color-memora-warning-surface)",
    border: "1px solid var(--color-memora-warning-border)",
    borderRadius: 10,
    color: "var(--color-memora-warning-text)",
    fontSize: 13,
    margin: 0,
    paddingBlock: 8,
    paddingInline: 10,
  },
  actions: { alignItems: "center", display: "flex", gap: 8, justifyContent: "flex-end" },
  button: { borderRadius: 9, fontSize: 14, minHeight: 36, paddingBlock: 7, paddingInline: 13 },
  cancel: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-memora-border)",
    color: "var(--color-memora-text-muted)",
    ":hover": { backgroundColor: "var(--color-memora-hover)" },
  },
  save: {
    backgroundColor: "var(--color-memora-text)",
    border: "1px solid var(--color-memora-text)",
    color: "var(--color-memora-surface)",
    ":hover": { backgroundColor: "var(--color-memora-text-strong)" },
  },
});

interface SaveWidgetDefinitionDialogProps {
  open: boolean;
  widgetCode: string;
  widgetName: string;
  defaultDataSourceName?: DataSourceName;
  defaultDataSourceParams?: Record<string, unknown>;
  // The file names the agent declared via show_widget's data_files (ADR 0008) — carried straight
  // into widget.json on save with no dedicated UI, same as the source code itself.
  dataFiles?: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (
    input: SaveChatWidgetDefinitionInput,
  ) => SaveChatWidgetDefinitionResult | Promise<SaveChatWidgetDefinitionResult>;
}

export function SaveWidgetDefinitionDialog({
  open,
  widgetCode,
  widgetName,
  defaultDataSourceName,
  defaultDataSourceParams,
  dataFiles,
  onOpenChange,
  onSave,
}: SaveWidgetDefinitionDialogProps): JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  const dataSourceRef = useRef<HTMLSelectElement>(null);
  const [dataSourceName, setDataSourceName] = useState<DataSourceName | "">("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const selectedDataSource = dataSourceName ? getDataSourceCatalogEntry(dataSourceName) : undefined;

  // The agent's chosen catalog binding (data_source/data_source_params on show_widget) pre-fills
  // this dialog; the user can still change either before saving.
  useEffect(() => {
    if (!open) {
      return;
    }
    const entry = defaultDataSourceName
      ? getDataSourceCatalogEntry(defaultDataSourceName)
      : undefined;
    setDataSourceName(defaultDataSourceName ?? "");
    setParamValues(
      stringifyDataSourceParamValues(
        entry,
        defaultDataSourceParams ?? getDefaultDataSourceParams(entry),
      ),
    );
    setError(null);
  }, [open, defaultDataSourceName, defaultDataSourceParams]);

  const handleClose = useCallback(() => {
    setError(null);
    setIsSaving(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSave = useCallback(async () => {
    const validationError = validateDataSourceParamValues(selectedDataSource, paramValues);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await onSave({
        id: crypto.randomUUID(),
        name: widgetName || "Untitled widget",
        widgetCode,
        dataSourceName: dataSourceName || undefined,
        dataSourceParams: parseDataSourceParamValues(selectedDataSource, paramValues),
        dataFiles,
      });

      if (!result.ok) {
        setError("This preview has no widget source to save.");
        setIsSaving(false);
        return;
      }

      handleClose();
    } catch {
      setError("Couldn't save this widget definition. Try again.");
      setIsSaving(false);
    }
  }, [
    dataFiles,
    dataSourceName,
    handleClose,
    onSave,
    paramValues,
    selectedDataSource,
    widgetCode,
    widgetName,
  ]);

  return (
    <NativeDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={dataSourceRef}
      panelClassName={stylex.props(styles.panel).className}
    >
      <div {...stylex.props(styles.content)}>
        <div>
          <h2 id={titleId} {...stylex.props(styles.heading)}>
            Save widget definition
          </h2>
          <p id={descriptionId} {...stylex.props(styles.description)}>
            Save this preview for later use. Bind it to a catalog data source if it needs one.
          </p>
        </div>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="widget-data-source" {...stylex.props(styles.label)}>
            Data source
          </label>
          <select
            ref={dataSourceRef}
            id="widget-data-source"
            value={dataSourceName}
            onChange={(event) => {
              const nextEntry = getDataSourceCatalogEntry(event.target.value);
              setDataSourceName(nextEntry?.name ?? "");
              if (nextEntry?.name !== defaultDataSourceName) {
                setParamValues(
                  stringifyDataSourceParamValues(nextEntry, getDefaultDataSourceParams(nextEntry)),
                );
              }
              setError(null);
            }}
            {...stylex.props(styles.select)}
          >
            <option value="">No data source</option>
            {DATA_SOURCE_CATALOG.map((option) => (
              <option key={option.name} value={option.name}>
                {option.label}
              </option>
            ))}
          </select>
          {selectedDataSource && (
            <p {...stylex.props(styles.sourceDescription)}>{selectedDataSource.description}</p>
          )}
        </div>
        <DataSourceParamsFields
          entry={selectedDataSource}
          values={paramValues}
          idPrefix="save-widget-param"
          onChange={(key, value) => {
            setParamValues((current) => ({ ...current, [key]: value }));
            setError(null);
          }}
        />
        {error && <p {...stylex.props(styles.error)}>{error}</p>}
        <div {...stylex.props(styles.actions)}>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            {...stylex.props(styles.button, styles.cancel)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            {...stylex.props(styles.button, styles.save)}
          >
            {isSaving ? "Saving…" : "Save definition"}
          </button>
        </div>
      </div>
    </NativeDialog>
  );
}
