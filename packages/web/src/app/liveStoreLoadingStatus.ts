interface LiveStoreProgress {
  done: number;
  total: number;
}

type LiveStoreProgressStage = "migrating" | "rehydrating" | "syncing";

export type LiveStoreLoadingStatus =
  | { stage: "loading" }
  | { stage: LiveStoreProgressStage; progress: LiveStoreProgress };

interface LiveStoreBootStatusInput {
  stage: string;
  progress?: LiveStoreProgress;
}

export function createLiveStoreLoadingStatus(
  status: LiveStoreBootStatusInput,
): LiveStoreLoadingStatus {
  switch (status.stage) {
    case "migrating":
    case "rehydrating":
    case "syncing":
      return {
        stage: status.stage,
        progress: {
          done: sanitizeProgressValue(status.progress?.done),
          total: sanitizeProgressValue(status.progress?.total),
        },
      };
    default:
      return { stage: "loading" };
  }
}

function sanitizeProgressValue(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}
