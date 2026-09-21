import { PencilSimpleIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";

import type { RecentItem } from "@/components/dashboard/recentItems";
import { DataSourceParamsFields } from "@/components/widgets/DataSourceParamsFields";
import { useDataSourceValue } from "@/hooks/widgets/useDataSourceValue";
import { useWidgetSourceCode } from "@/hooks/widgets/useWidgetSourceCode";
import {
  getDataSourceCatalogEntry,
  parseDataSourceParamValues,
  stringifyDataSourceParamValues,
  validateDataSourceParamValues,
} from "@/lib/widgets/dataSourceCatalog";
import { parseWidgetDefinitionDataSourceParams } from "@/lib/widgets/widgetDefinitions";
import type { WritableReactiveWidgetStore } from "@/lib/widgets/widgetStore";
import type { BuiltinWidgetKey, widgetDefinition } from "@/livestore/widget";
import type { FileMeta } from "@/types/library";

import { renderBuiltinWidget } from "./builtinWidgetPreview";
import { GeneratedWidgetFrame } from "./GeneratedWidgetFrame";
import { GeneratedWidgetLoadingState } from "./GeneratedWidgetLoadingState";

const styles = stylex.create({
  root: { inset: 0, position: "fixed", zIndex: 50 },
  backdrop: { backgroundColor: "rgb(24 24 27 / 0.35)", inset: 0, position: "absolute" },
  panel: {
    backgroundColor: "var(--color-memora-surface)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    bottom: 0,
    boxShadow: "0 -20px 40px rgb(0 0 0 / 0.16)",
    display: "flex",
    flexDirection: "column",
    height: "min(560px, 60vh)",
    insetInline: 0,
    outline: "none",
    position: "absolute",
  },
  header: {
    alignItems: "center",
    borderBottom: "1px solid var(--color-memora-border)",
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 16,
    paddingInline: 20,
  },
  heading: { color: "var(--color-memora-text-strong)", fontSize: 18, fontWeight: 650, margin: 0 },
  closeButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    border: "none",
    borderRadius: 9999,
    color: "var(--color-memora-text-muted)",
    cursor: "pointer",
    display: "flex",
    height: 32,
    justifyContent: "center",
    width: 32,
    ":hover": { backgroundColor: "var(--color-memora-hover)" },
  },
  closeIcon: { height: 18, width: 18 },
  body: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    overflowY: "auto",
    paddingBlock: 16,
    paddingInline: 20,
  },
  empty: { color: "var(--color-memora-text-muted)", fontSize: 14, gridColumn: "1 / -1" },
  card: {
    backgroundColor: "var(--color-memora-surface-soft)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
  },
  cardHeader: { alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" },
  cardName: {
    color: "var(--color-memora-text)",
    fontSize: 14,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  renameInput: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-olive-soft)",
    borderRadius: 8,
    color: "var(--color-memora-text)",
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    minWidth: 0,
    paddingBlock: 4,
    paddingInline: 8,
  },
  cardHeaderActions: { alignItems: "center", display: "flex", flexShrink: 0, gap: 4 },
  iconButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    border: "none",
    borderRadius: 9999,
    color: "var(--color-memora-text-muted)",
    cursor: "pointer",
    display: "flex",
    height: 26,
    justifyContent: "center",
    width: 26,
    ":hover": { backgroundColor: "var(--color-memora-hover)" },
  },
  iconButtonDanger: { color: "#b91c1c", ":hover": { backgroundColor: "#fef2f2" } },
  icon: { height: 14, width: 14 },
  badge: {
    backgroundColor: "var(--color-memora-hover)",
    borderRadius: 9999,
    color: "var(--color-memora-text-muted)",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 600,
    paddingBlock: 3,
    paddingInline: 8,
  },
  preview: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 12,
    maxHeight: 220,
    overflow: "auto",
  },
  status: {
    alignItems: "center",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    fontSize: 12,
    justifyContent: "center",
    padding: 16,
    textAlign: "center",
  },
  error: {
    backgroundColor: "var(--color-memora-warning-surface)",
    border: "1px solid var(--color-memora-warning-border)",
    borderRadius: 10,
    color: "var(--color-memora-warning-text)",
    fontSize: 12,
    margin: 0,
    paddingBlock: 6,
    paddingInline: 8,
  },
  cardActions: { display: "flex", justifyContent: "flex-end" },
  button: {
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    minHeight: 32,
    paddingBlock: 6,
    paddingInline: 12,
  },
  confirm: {
    backgroundColor: "var(--color-memora-text)",
    border: "1px solid var(--color-memora-text)",
    color: "var(--color-memora-surface)",
    cursor: "pointer",
    ":hover": { backgroundColor: "var(--color-memora-text-strong)" },
  },
});

export interface PlaceWidgetInput {
  id: string;
  definitionId: string;
  params: Record<string, unknown>;
}

const placeFromPreview = (
  previewRef: { current: HTMLElement | null },
  onPlace: (input: PlaceWidgetInput, sourceElement: HTMLElement | null) => void,
  input: Omit<PlaceWidgetInput, "id">,
): void => {
  onPlace({ ...input, id: crypto.randomUUID() }, previewRef.current);
};

const BUILTIN_ORDER: Record<BuiltinWidgetKey, number> = { calendar: 0, todo: 1, recent: 2 };

const sortDefinitions = (definitions: readonly widgetDefinition[]): widgetDefinition[] => {
  return [...definitions].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "builtin" ? -1 : 1;
    }
    if (left.kind === "builtin") {
      const leftOrder = left.builtinKey ? BUILTIN_ORDER[left.builtinKey] : 0;
      const rightOrder = right.builtinKey ? BUILTIN_ORDER[right.builtinKey] : 0;
      return leftOrder - rightOrder;
    }
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
};

function BuiltinDefinitionCard({
  definition,
  store,
  files,
  recentItems,
  isPlaced,
  onPlace,
}: {
  definition: widgetDefinition;
  store: WritableReactiveWidgetStore;
  files: FileMeta[];
  recentItems: RecentItem[];
  isPlaced: boolean;
  onPlace: (input: PlaceWidgetInput, sourceElement: HTMLElement | null) => void;
}): JSX.Element {
  const previewRef = useRef<HTMLDivElement>(null);

  return (
    <div {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardHeader)}>
        <span {...stylex.props(styles.cardName)}>{definition.name || "Untitled widget"}</span>
        {isPlaced && <span {...stylex.props(styles.badge)}>Placed</span>}
      </div>
      <div ref={previewRef} {...stylex.props(styles.preview)}>
        {renderBuiltinWidget({ definition, store, files, recentItems })}
      </div>
      <div {...stylex.props(styles.cardActions)}>
        <button
          type="button"
          onClick={() =>
            placeFromPreview(previewRef, onPlace, {
              definitionId: definition.id,
              params: {},
            })
          }
          {...stylex.props(styles.button, styles.confirm)}
        >
          Add to Home Grid
        </button>
      </div>
    </div>
  );
}

function GeneratedDefinitionCard({
  store,
  definition,
  onPlace,
  onRename,
  onDelete,
}: {
  store: WritableReactiveWidgetStore;
  definition: widgetDefinition;
  onPlace: (input: PlaceWidgetInput, sourceElement: HTMLElement | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const entry = getDataSourceCatalogEntry(definition.dataSourceName);
  const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
    stringifyDataSourceParamValues(entry, parseWidgetDefinitionDataSourceParams(definition)),
  );
  const [error, setError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(definition.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const resolvedParams = useMemo(
    () => parseDataSourceParamValues(entry, paramValues),
    [entry, paramValues],
  );
  const dataState = useDataSourceValue(store, definition.dataSourceName, resolvedParams);
  const source = useWidgetSourceCode(store, definition.sourceFileId);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleAdd = useCallback(() => {
    const validationError = validateDataSourceParamValues(entry, paramValues);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    placeFromPreview(previewRef, onPlace, {
      definitionId: definition.id,
      params: resolvedParams,
    });
  }, [definition.id, entry, onPlace, paramValues, resolvedParams]);

  const commitRename = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== definition.name) {
      onRename(definition.id, trimmed);
    } else {
      setNameDraft(definition.name);
    }
    setIsRenaming(false);
  }, [definition.id, definition.name, nameDraft, onRename]);

  let preview: ReactNode;
  if (source.status === "loading") {
    preview = <GeneratedWidgetLoadingState />;
  } else if (source.status !== "ready" || source.code === null) {
    preview = <div {...stylex.props(styles.status)}>This widget's source couldn't be loaded.</div>;
  } else {
    preview = (
      <GeneratedWidgetFrame
        widgetCode={source.code}
        data={dataState?.status === "ready" ? dataState.value : undefined}
        dataReady={dataState?.status === "ready"}
        title={definition.name}
      />
    );
  }

  return (
    <div {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardHeader)}>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRename();
              } else if (event.key === "Escape") {
                setNameDraft(definition.name);
                setIsRenaming(false);
              }
            }}
            aria-label="Widget name"
            {...stylex.props(styles.renameInput)}
          />
        ) : (
          <span {...stylex.props(styles.cardName)} title={definition.name}>
            {definition.name || "Untitled widget"}
          </span>
        )}
        <div {...stylex.props(styles.cardHeaderActions)}>
          <button
            type="button"
            onClick={() => setIsRenaming(true)}
            aria-label={`Rename ${definition.name || "widget"}`}
            {...stylex.props(styles.iconButton)}
          >
            <PencilSimpleIcon className={stylex.props(styles.icon).className} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(definition.id)}
            aria-label={`Delete ${definition.name || "widget"}`}
            {...stylex.props(styles.iconButton, styles.iconButtonDanger)}
          >
            <TrashIcon className={stylex.props(styles.icon).className} />
          </button>
        </div>
      </div>
      <div ref={previewRef} {...stylex.props(styles.preview)}>
        {preview}
      </div>
      <DataSourceParamsFields
        entry={entry}
        values={paramValues}
        idPrefix={`add-widget-${definition.id}`}
        onChange={(key, value) => {
          setParamValues((current) => ({ ...current, [key]: value }));
          setError(null);
        }}
      />
      {error && <p {...stylex.props(styles.error)}>{error}</p>}
      <div {...stylex.props(styles.cardActions)}>
        <button type="button" onClick={handleAdd} {...stylex.props(styles.button, styles.confirm)}>
          Add to Home Grid
        </button>
      </div>
    </div>
  );
}

interface AddWidgetDrawerProps {
  open: boolean;
  definitions: readonly widgetDefinition[];
  placedDefinitionIds: ReadonlySet<string>;
  store: WritableReactiveWidgetStore;
  files: FileMeta[];
  recentItems: RecentItem[];
  onOpenChange: (open: boolean) => void;
  onPlace: (input: PlaceWidgetInput, sourceElement: HTMLElement | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function AddWidgetDrawer({
  open,
  definitions,
  placedDefinitionIds,
  store,
  files,
  recentItems,
  onOpenChange,
  onPlace,
  onRename,
  onDelete,
}: AddWidgetDrawerProps): JSX.Element {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const orderedDefinitions = useMemo(() => sortDefinitions(definitions), [definitions]);

  useEffect(() => {
    if (!open) {
      return;
    }
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...stylex.props(styles.root)}
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            {...stylex.props(styles.backdrop)}
            aria-label="Close add widget drawer"
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reducedMotion ? false : { transform: "translateY(100%)" }}
            animate={{ transform: "translateY(0%)" }}
            exit={{ transform: reducedMotion ? "translateY(0%)" : "translateY(100%)" }}
            transition={{ type: "tween", duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            {...stylex.props(styles.panel)}
          >
            <div {...stylex.props(styles.header)}>
              <h2 id={titleId} {...stylex.props(styles.heading)}>
                Add widget
              </h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                {...stylex.props(styles.closeButton)}
              >
                <XIcon className={stylex.props(styles.closeIcon).className} />
              </button>
            </div>
            <div {...stylex.props(styles.body)}>
              {orderedDefinitions.length === 0 ? (
                <p {...stylex.props(styles.empty)}>No saved widgets yet.</p>
              ) : (
                orderedDefinitions.map((definition) =>
                  definition.kind === "generated" ? (
                    <GeneratedDefinitionCard
                      key={definition.id}
                      store={store}
                      definition={definition}
                      onPlace={onPlace}
                      onRename={onRename}
                      onDelete={onDelete}
                    />
                  ) : (
                    <BuiltinDefinitionCard
                      key={definition.id}
                      definition={definition}
                      store={store}
                      files={files}
                      recentItems={recentItems}
                      isPlaced={placedDefinitionIds.has(definition.id)}
                      onPlace={onPlace}
                    />
                  ),
                )
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
