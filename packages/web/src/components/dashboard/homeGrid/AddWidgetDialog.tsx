import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import { NativeDialog } from "@/components/ui/NativeDialog";
import { getDataSourceCatalogEntry } from "@/lib/widgets/dataSourceCatalog";
import type { widgetDefinition } from "@/livestore/widget";

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
  empty: { color: "var(--color-memora-text-muted)", fontSize: 14, lineHeight: 1.5, margin: 0 },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    listStyle: "none",
    margin: 0,
    maxHeight: 320,
    overflowY: "auto",
    padding: 0,
  },
  item: {
    backgroundColor: "var(--color-memora-surface-soft)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 12,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingBlock: 10,
    paddingInline: 12,
    textAlign: "left",
    width: "100%",
    ":hover": { backgroundColor: "var(--color-memora-hover)" },
  },
  itemName: { color: "var(--color-memora-text)", fontSize: 14, fontWeight: 600 },
  itemSource: { color: "var(--color-memora-text-muted)", fontSize: 12, lineHeight: 1.4 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  label: { color: "var(--color-memora-text)", fontSize: 14, fontWeight: 600 },
  sourceDescription: {
    color: "var(--color-memora-text-muted)",
    fontSize: 13,
    lineHeight: 1.45,
    margin: 0,
  },
  input: {
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
  confirm: {
    backgroundColor: "var(--color-memora-text)",
    border: "1px solid var(--color-memora-text)",
    color: "var(--color-memora-surface)",
    ":hover": { backgroundColor: "var(--color-memora-text-strong)" },
  },
});

export interface PlaceWidgetInput {
  definitionId: string;
  params: Record<string, unknown>;
}

interface AddWidgetDialogProps {
  open: boolean;
  definitions: widgetDefinition[];
  onOpenChange: (open: boolean) => void;
  onPlace: (input: PlaceWidgetInput) => void;
}

export function AddWidgetDialog({
  open,
  definitions,
  onOpenChange,
  onPlace,
}: AddWidgetDialogProps): JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  const firstDefinitionButtonRef = useRef<HTMLButtonElement>(null);
  const limitInputRef = useRef<HTMLInputElement>(null);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
  const [recentFilesLimit, setRecentFilesLimit] = useState("5");
  const [error, setError] = useState<string | null>(null);

  const selectedDefinition = useMemo(
    () => definitions.find((definition) => definition.id === selectedDefinitionId) ?? null,
    [definitions, selectedDefinitionId],
  );
  const selectedDataSource = selectedDefinition
    ? getDataSourceCatalogEntry(selectedDefinition.dataSourceName)
    : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedDefinitionId(null);
    setError(null);
  }, [open]);

  const handleSelectDefinition = useCallback((definition: widgetDefinition) => {
    setSelectedDefinitionId(definition.id);
    setError(null);
    if (definition.dataSourceName === "recentFiles") {
      const params = JSON.parse(definition.dataSourceParams || "{}") as { limit?: unknown };
      setRecentFilesLimit(
        typeof params.limit === "number" && params.limit > 0 ? String(params.limit) : "5",
      );
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedDefinitionId(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleConfirm = useCallback(() => {
    if (!selectedDefinition) {
      return;
    }

    const params: Record<string, unknown> = {};
    if (selectedDefinition.dataSourceName === "recentFiles") {
      const limit = Number(recentFilesLimit);
      if (!Number.isInteger(limit) || limit < 1) {
        setError("Enter a whole number of files to show.");
        return;
      }
      params.limit = limit;
    }

    onPlace({ definitionId: selectedDefinition.id, params });
    handleClose();
  }, [handleClose, onPlace, recentFilesLimit, selectedDefinition]);

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
      initialFocusRef={selectedDefinition ? limitInputRef : firstDefinitionButtonRef}
      panelClassName={stylex.props(styles.panel).className}
    >
      <div {...stylex.props(styles.content)}>
        {!selectedDefinition ? (
          <>
            <div>
              <h2 id={titleId} {...stylex.props(styles.heading)}>
                Add widget
              </h2>
              <p id={descriptionId} {...stylex.props(styles.description)}>
                Choose a saved widget definition to place on your Home Grid.
              </p>
            </div>
            {definitions.length === 0 ? (
              <p {...stylex.props(styles.empty)}>
                No saved widget definitions yet. Save one from a chat preview first.
              </p>
            ) : (
              <ul {...stylex.props(styles.list)}>
                {definitions.map((definition, index) => (
                  <li key={definition.id}>
                    <button
                      type="button"
                      ref={index === 0 ? firstDefinitionButtonRef : undefined}
                      onClick={() => handleSelectDefinition(definition)}
                      {...stylex.props(styles.item)}
                    >
                      <span {...stylex.props(styles.itemName)}>
                        {definition.name || "Untitled widget"}
                      </span>
                      <span {...stylex.props(styles.itemSource)}>
                        {getDataSourceCatalogEntry(definition.dataSourceName)?.label ??
                          definition.dataSourceName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div {...stylex.props(styles.actions)}>
              <button
                type="button"
                onClick={handleClose}
                {...stylex.props(styles.button, styles.cancel)}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 id={titleId} {...stylex.props(styles.heading)}>
                Configure widget
              </h2>
              <p id={descriptionId} {...stylex.props(styles.description)}>
                Set this placement's data before adding it to your Home Grid.
              </p>
            </div>
            <div {...stylex.props(styles.field)}>
              <span {...stylex.props(styles.label)}>Data source</span>
              <p {...stylex.props(styles.sourceDescription)}>{selectedDataSource?.description}</p>
            </div>
            {selectedDefinition.dataSourceName === "recentFiles" && (
              <div {...stylex.props(styles.field)}>
                <label htmlFor="place-recent-files-limit" {...stylex.props(styles.label)}>
                  Files to show
                </label>
                <input
                  ref={limitInputRef}
                  id="place-recent-files-limit"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={recentFilesLimit}
                  onChange={(event) => {
                    setRecentFilesLimit(event.target.value);
                    setError(null);
                  }}
                  {...stylex.props(styles.input)}
                />
              </div>
            )}
            {error && <p {...stylex.props(styles.error)}>{error}</p>}
            <div {...stylex.props(styles.actions)}>
              <button
                type="button"
                onClick={handleBack}
                {...stylex.props(styles.button, styles.cancel)}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                {...stylex.props(styles.button, styles.confirm)}
              >
                Add to Home Grid
              </button>
            </div>
          </>
        )}
      </div>
    </NativeDialog>
  );
}
