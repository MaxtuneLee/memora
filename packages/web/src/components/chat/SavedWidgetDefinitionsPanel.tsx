import { type JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import { useAppStore } from "@/livestore/store";
import type { DataSourceName, widgetDefinition } from "@/livestore/widget";
import { getDataSourceCatalogEntry } from "@/lib/widgets/dataSourceCatalog";
import { activeWidgetDefinitionsQuery$ } from "@/lib/widgets/widgetQueries";

const styles = stylex.create({
  root: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderLeft: "1px solid var(--color-memora-border)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    overflowY: "auto",
    padding: 16,
    width: 280,
    "@media (max-width: 64rem)": {
      borderLeft: "none",
      borderTop: "1px solid var(--color-memora-border)",
      maxHeight: 240,
      width: "100%",
    },
  },
  heading: { color: "var(--color-memora-text-strong)", fontSize: 15, fontWeight: 650, margin: 0 },
  empty: { color: "var(--color-memora-text-muted)", fontSize: 13, lineHeight: 1.5, margin: 0 },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  item: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    padding: 12,
  },
  name: {
    color: "var(--color-memora-text)",
    fontSize: 14,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  source: { color: "var(--color-memora-text-muted)", fontSize: 12, lineHeight: 1.4 },
});

const getDataSourceLabel = (dataSourceName: DataSourceName): string => {
  return getDataSourceCatalogEntry(dataSourceName)?.label ?? dataSourceName;
};

const sortByUpdatedAt = (definitions: readonly widgetDefinition[]): widgetDefinition[] => {
  return definitions
    .filter((definition) => definition.kind === "generated")
    .toSorted((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
};

export function SavedWidgetDefinitionsPanel(): JSX.Element {
  const store = useAppStore();
  const definitions = store.useQuery(activeWidgetDefinitionsQuery$) as widgetDefinition[];
  const sortedDefinitions = sortByUpdatedAt(definitions);

  return (
    <aside {...stylex.props(styles.root)} aria-label="Saved widget definitions">
      <h2 {...stylex.props(styles.heading)}>Saved definitions</h2>
      {sortedDefinitions.length === 0 ? (
        <p {...stylex.props(styles.empty)}>
          Save a chat preview to keep a reusable definition here.
        </p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {sortedDefinitions.map((definition) => (
            <li key={definition.id} {...stylex.props(styles.item)}>
              <span {...stylex.props(styles.name)} title={definition.name}>
                {definition.name || "Untitled widget"}
              </span>
              <span {...stylex.props(styles.source)}>
                {getDataSourceLabel(definition.dataSourceName)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
