import { useEffect, useRef, useState } from "react";

import {
  DATA_SOURCE_LIVE_QUERIES,
  resolveDataSource,
  type DataSourceName,
} from "@/lib/widgets/dataSourceCatalog";
import { activeWidgetDefinitionsQuery$ } from "@/lib/widgets/widgetQueries";
import type { ReactiveWidgetStore } from "@/lib/widgets/widgetStore";

// Poll interval for data sources with no livestore query to subscribe to (storageStats,
// chatSessionCount) — the only way to catch OPFS/browser storage changes without a reload.
const DATA_SOURCE_POLL_INTERVAL_MS = 5_000;

export type DataSourceValueState = { status: "loading" } | { status: "ready"; value: unknown };

// Widget scripts (chat's onData bridge and the Home Grid shim alike) treat "no payload yet" and
// "resolved payload" as distinct states, so a widget never mistakes an in-flight fetch for a
// real (possibly falsy) value. Pass `null` for dataSourceName when a widget has no catalog
// binding yet — the hook then reports nothing at all instead of throwing on an unknown source.
export const useDataSourceValue = (
  store: ReactiveWidgetStore,
  dataSourceName: DataSourceName | null,
  params: Record<string, unknown>,
): DataSourceValueState | null => {
  // Always subscribe to a query (falling back to a harmless one) so hook call order never
  // changes across renders of the same widget tile.
  const liveQuery = dataSourceName ? DATA_SOURCE_LIVE_QUERIES[dataSourceName] : undefined;
  const liveSignal = store.useQuery(liveQuery ?? activeWidgetDefinitionsQuery$);
  const [state, setState] = useState<DataSourceValueState | null>(null);
  const paramsKey = JSON.stringify(params);
  const hasResolvedRef = useRef(false);

  useEffect(() => {
    hasResolvedRef.current = false;
  }, [dataSourceName]);

  useEffect(() => {
    if (!dataSourceName) {
      setState(null);
      return;
    }

    let cancelled = false;

    // Only show "loading" for the first resolution of this data source — a later poll/live-query
    // refresh swaps the value in place rather than flashing back to a loading state.
    if (!hasResolvedRef.current) {
      setState({ status: "loading" });
    }

    const resolve = () => {
      void resolveDataSource(dataSourceName, store, params).then((resolved) => {
        if (cancelled) {
          return;
        }
        hasResolvedRef.current = true;
        setState({ status: "ready", value: resolved });
      });
    };

    resolve();
    const pollId = liveQuery ? null : window.setInterval(resolve, DATA_SOURCE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollId !== null) {
        window.clearInterval(pollId);
      }
    };
    // oxlint-disable-next-line react/exhaustive-deps
  }, [store, dataSourceName, paramsKey, liveSignal, liveQuery]);

  return state;
};
