import { useEffect, useState } from "react";

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

export const useDataSourceValue = (
  store: ReactiveWidgetStore,
  dataSourceName: DataSourceName,
  params: Record<string, unknown>,
): unknown => {
  // Always subscribe to a query (falling back to a harmless one) so hook call order never
  // changes across renders of the same widget tile.
  const liveQuery = DATA_SOURCE_LIVE_QUERIES[dataSourceName];
  const liveSignal = store.useQuery(liveQuery ?? activeWidgetDefinitionsQuery$);
  const [value, setValue] = useState<unknown>(undefined);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;

    const resolve = () => {
      void resolveDataSource(dataSourceName, store, params).then((resolved) => {
        if (!cancelled) {
          setValue(resolved);
        }
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

  return value;
};
