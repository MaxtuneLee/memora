import { Toast } from "@base-ui/react/toast";
import { useCallback, useEffect, useState } from "react";

import {
  clearNemotronCache,
  downloadNemotronCache,
  getNemotronCacheStatus,
  type NemotronResourceProgress,
} from "@/lib/playground/nemotron/cache";

export type NemotronCacheStatusKind =
  | "idle"
  | "checking"
  | "cached"
  | "not-cached"
  | "downloading"
  | "error";

export interface NemotronCacheState {
  status: NemotronCacheStatusKind;
  progress: number;
  totalBytes: number;
  error?: string;
}

const INITIAL_STATE: NemotronCacheState = { status: "idle", progress: 0, totalBytes: 0 };
const PROGRESS_PUBLISH_INTERVAL_MS = 100;

interface UseNemotronCacheSettingsOptions {
  open: boolean;
}

export const useNemotronCacheSettings = ({ open }: UseNemotronCacheSettingsOptions) => {
  const { add } = Toast.useToastManager();
  const [state, setState] = useState<NemotronCacheState>(INITIAL_STATE);

  const refreshNemotronCacheState = useCallback(async () => {
    setState((current) => ({ ...current, status: "checking" }));
    const cache = await getNemotronCacheStatus();
    setState({
      status: cache.cached ? "cached" : "not-cached",
      progress: cache.cached ? 100 : 0,
      totalBytes: cache.totalBytes,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshNemotronCacheState();
  }, [open, refreshNemotronCacheState]);

  const handleDownloadNemotronCache = useCallback(async () => {
    setState({ status: "downloading", progress: 0, totalBytes: 0 });

    const loadedByFile = new Map<string, number>();
    const totalByFile = new Map<string, number>();
    let lastPublishedAt = performance.now();

    try {
      await downloadNemotronCache({
        onProgress: (event: NemotronResourceProgress) => {
          loadedByFile.set(event.file, event.loaded);
          if (event.total !== undefined) totalByFile.set(event.file, event.total);

          const timestamp = performance.now();
          const isDone = event.total !== undefined && event.loaded >= event.total;
          if (!isDone && timestamp - lastPublishedAt < PROGRESS_PUBLISH_INTERVAL_MS) return;
          lastPublishedAt = timestamp;

          const totalBytes = [...totalByFile.values()].reduce((sum, value) => sum + value, 0);
          const loadedBytes = [...loadedByFile.values()].reduce((sum, value) => sum + value, 0);
          setState({
            status: "downloading",
            progress: totalBytes > 0 ? Math.min(100, (loadedBytes / totalBytes) * 100) : 0,
            totalBytes,
          });
        },
      });

      await refreshNemotronCacheState();
      add({ title: "Nemotron model cached", type: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed";
      setState({ status: "error", progress: 0, totalBytes: 0, error: message });
      add({ title: "Failed to download Nemotron model", description: message, type: "error" });
    }
  }, [add, refreshNemotronCacheState]);

  const handleDeleteNemotronCache = useCallback(async () => {
    await clearNemotronCache();
    await refreshNemotronCacheState();
    add({ title: "Nemotron cache removed", type: "success" });
  }, [add, refreshNemotronCacheState]);

  return {
    nemotronCacheState: state,
    handleDownloadNemotronCache,
    handleDeleteNemotronCache,
    refreshNemotronCacheState,
  };
};
