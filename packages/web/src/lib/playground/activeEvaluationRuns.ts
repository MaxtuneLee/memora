import type { DatasetSelection } from "@memora/datasets";

const active = new Map<string, number>();

const selectionKey = (selection: DatasetSelection) =>
  [selection.datasetId, selection.revision, selection.configuration, selection.split].join(":");

export const activeEvaluationRuns = {
  begin(selection: DatasetSelection): () => void {
    const key = selectionKey(selection);
    active.set(key, (active.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (active.get(key) ?? 1) - 1;
      if (remaining > 0) active.set(key, remaining);
      else active.delete(key);
    };
  },
  isActive(selection: DatasetSelection): boolean {
    return (active.get(selectionKey(selection)) ?? 0) > 0;
  },
};
