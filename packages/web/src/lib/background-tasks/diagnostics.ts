import type { BackgroundTask, BackgroundTaskState } from "./types";

export interface BackgroundTaskDiagnostics {
  total: number;
  byState: Record<BackgroundTaskState, number>;
  byKind: Record<string, number>;
  oldestQueuedAt: number | null;
  failed: Array<Pick<BackgroundTask, "id" | "kind" | "error" | "updatedAt">>;
}

export const summarizeBackgroundTasks = (
  tasks: readonly BackgroundTask[],
): BackgroundTaskDiagnostics => {
  const byState: Record<BackgroundTaskState, number> = {
    queued: 0,
    running: 0,
    waiting: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
  };
  const byKind: Record<string, number> = {};
  let oldestQueuedAt: number | null = null;
  for (const task of tasks) {
    byState[task.state] += 1;
    byKind[task.kind] = (byKind[task.kind] ?? 0) + 1;
    if (task.state === "queued") {
      oldestQueuedAt =
        oldestQueuedAt === null ? task.createdAt : Math.min(oldestQueuedAt, task.createdAt);
    }
  }
  return {
    total: tasks.length,
    byState,
    byKind,
    oldestQueuedAt,
    failed: tasks
      .filter((task) => task.state === "failed")
      .map(({ id, kind, error, updatedAt }) => ({ id, kind, error, updatedAt })),
  };
};
