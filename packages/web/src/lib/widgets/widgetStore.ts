import type { ReactApi } from "@livestore/react";

export interface WidgetQueryableStore {
  query(query: unknown): unknown;
}

export interface ReactiveWidgetStore extends WidgetQueryableStore, Pick<ReactApi, "useQuery"> {}
