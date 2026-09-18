import type { ReactApi } from "@livestore/react";
import { useEffect, useState } from "react";

import {
  DATA_SOURCE_LIVE_QUERIES,
  resolveDataSource,
  type DataSourceName,
} from "@/lib/widgets/dataSourceCatalog";
import { activeWidgetDefinitionsQuery$ } from "@/lib/widgets/widgetQueries";
import type { WidgetQueryableStore } from "@/lib/widgets/widgetStore";

interface DataSourceStore extends WidgetQueryableStore, Pick<ReactApi, "useQuery"> {}

export const useDataSourceValue = (
  store: DataSourceStore,
  dataSourceName: DataSourceName,
  params: Record<string, unknown>,
): unknown => {
  // Always subscribe to a query (falling back to a harmless one) so hook call order never
  // changes across renders of the same widget tile.
  const liveQuery = DATA_SOURCE_LIVE_QUERIES[dataSourceName] ?? activeWidgetDefinitionsQuery$;
  const liveSignal = store.useQuery(liveQuery);
  const [value, setValue] = useState<unknown>(undefined);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;

    void resolveDataSource(dataSourceName, store, params).then((resolved) => {
      if (!cancelled) {
        setValue(resolved);
      }
    });

    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-deps
  }, [store, dataSourceName, paramsKey, liveSignal]);

  return value;
};
