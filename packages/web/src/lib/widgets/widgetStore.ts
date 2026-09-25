import type { ReactApi } from "@livestore/react";

export interface WidgetQueryableStore {
  query(query: unknown): unknown;
}

export interface ReactiveWidgetStore extends WidgetQueryableStore, Pick<ReactApi, "useQuery"> {}

// A ReactiveWidgetStore that can also commit events — needed by components that write, not just
// read (e.g. the Home Grid's writeData host handler, see ADR 0008).
export interface WritableReactiveWidgetStore extends ReactiveWidgetStore {
  commit: (...events: unknown[]) => void;
}
