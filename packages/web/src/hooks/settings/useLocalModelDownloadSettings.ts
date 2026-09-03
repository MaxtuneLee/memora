import { Toast } from "@base-ui/react/toast";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  clearLocalModelCacheMarker,
  getLocalModelOptions as getAllLocalModelOptions,
  getLocalModelCacheStatus,
  localModelClient,
  writeLocalModelCacheMarker,
  type LocalModelOption,
} from "@/lib/local-model";
import {
  applyLocalModelProgressEvent,
  shouldPublishLocalModelProgress,
  type LocalModelDownloadState,
} from "@/lib/local-model/downloadState";

export type {
  LocalModelDownloadFileState,
  LocalModelDownloadState,
} from "@/lib/local-model/downloadState";

const DEFAULT_LOCAL_MODEL_OPTIONS = getAllLocalModelOptions();

let sharedLocalModelStates: Record<string, LocalModelDownloadState> = {};
const localModelStateListeners = new Set<() => void>();
const localModelStateListenersById = new Map<string, Set<() => void>>();

const getLocalModelStateSnapshot = (): Record<string, LocalModelDownloadState> => {
  return sharedLocalModelStates;
};

const subscribeToLocalModelStates = (listener: () => void): (() => void) => {
  localModelStateListeners.add(listener);
  return () => {
    localModelStateListeners.delete(listener);
  };
};

const subscribeToLocalModelState = (modelId: string, listener: () => void): (() => void) => {
  const listeners = localModelStateListenersById.get(modelId) ?? new Set<() => void>();
  listeners.add(listener);
  localModelStateListenersById.set(modelId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      localModelStateListenersById.delete(modelId);
    }
  };
};

const publishLocalModelStates = (
  update: (
    current: Record<string, LocalModelDownloadState>,
  ) => Record<string, LocalModelDownloadState>,
): void => {
  const previous = sharedLocalModelStates;
  const next = update(previous);
  if (next === previous) return;

  sharedLocalModelStates = next;
  localModelStateListeners.forEach((listener) => listener());
  for (const modelId of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (previous[modelId] === next[modelId]) continue;
    localModelStateListenersById.get(modelId)?.forEach((listener) => listener());
  }
};

const setLocalModelState = (modelId: string, state: LocalModelDownloadState): void => {
  publishLocalModelStates((current) =>
    current[modelId] === state
      ? current
      : {
          ...current,
          [modelId]: state,
        },
  );
};

export const getLocalModelOptions = (): LocalModelOption[] => {
  return DEFAULT_LOCAL_MODEL_OPTIONS;
};

interface UseLocalModelDownloadSettingsOptions {
  open: boolean;
  modelOptions?: LocalModelOption[];
}

export const useLocalModelDownloadState = (
  modelId: string,
): LocalModelDownloadState | undefined => {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToLocalModelState(modelId, listener),
    [modelId],
  );
  const getSnapshot = useCallback(() => sharedLocalModelStates[modelId], [modelId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useLocalModelsReady = (modelIds: readonly string[]): boolean => {
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribe = modelIds.map((modelId) => subscribeToLocalModelState(modelId, listener));
      return () => unsubscribe.forEach((cleanup) => cleanup());
    },
    [modelIds],
  );
  const getSnapshot = useCallback(
    () => modelIds.every((modelId) => sharedLocalModelStates[modelId]?.status === "cached"),
    [modelIds],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useLocalModelDownloadActions = ({
  open,
  modelOptions = DEFAULT_LOCAL_MODEL_OPTIONS,
}: UseLocalModelDownloadSettingsOptions) => {
  const { add } = Toast.useToastManager();

  const refreshLocalModelState = useCallback(async (modelId: string) => {
    setLocalModelState(modelId, { status: "checking" });
    const cache = await getLocalModelCacheStatus(modelId);
    setLocalModelState(modelId, {
      status: cache.cached ? "cached" : "not-cached",
      cache,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    for (const model of modelOptions) {
      void refreshLocalModelState(model.id);
    }
  }, [modelOptions, open, refreshLocalModelState]);

  const handleDownloadLocalModel = useCallback(
    async (modelId: string) => {
      console.warn("[local-model-download] start", { modelId });
      const controller = new AbortController();
      await clearLocalModelCacheMarker(modelId);
      console.warn("[local-model-download] cache marker cleared", { modelId });
      let downloadState: LocalModelDownloadState = {
        status: "downloading",
        progress: 0,
        files: [],
      };
      let lastPublishedAt = performance.now();
      setLocalModelState(modelId, downloadState);

      try {
        console.warn("[local-model-download] preload requested", { modelId });
        for await (const event of localModelClient.preloadModel(modelId, {
          priority: "background",
          signal: controller.signal,
        })) {
          if (event.type === "status") {
            console.warn("[local-model-download] status", { modelId, status: event.status });
          }
          if (event.type === "model-progress") {
            if (event.progress === undefined || event.progress === 0 || event.progress >= 100) {
              console.warn("[local-model-download] progress", { modelId, ...event });
            }
            downloadState = applyLocalModelProgressEvent(downloadState, event);
            const timestamp = performance.now();
            if (shouldPublishLocalModelProgress(lastPublishedAt, timestamp, event.progress)) {
              setLocalModelState(modelId, downloadState);
              lastPublishedAt = timestamp;
            }
          }

          if (event.type === "error") {
            console.error("[local-model-download] worker error", { modelId, error: event.error });
            throw new Error(event.error.message);
          }
        }

        setLocalModelState(modelId, downloadState);
        await writeLocalModelCacheMarker(modelId);
        await refreshLocalModelState(modelId);
        add({ title: "Local model ready", type: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Download failed";
        console.error("[local-model-download] failed", { modelId, error });
        setLocalModelState(modelId, { status: "error", error: message });
        add({ title: "Failed to download local model", description: message, type: "error" });
      }
    },
    [add, refreshLocalModelState],
  );

  return {
    localModelOptions: modelOptions,
    handleDownloadLocalModel,
    refreshLocalModelState,
  };
};

export const useLocalModelDownloadSettings = (options: UseLocalModelDownloadSettingsOptions) => {
  const actions = useLocalModelDownloadActions(options);
  const localModelStates = useSyncExternalStore(
    subscribeToLocalModelStates,
    getLocalModelStateSnapshot,
    getLocalModelStateSnapshot,
  );

  return {
    ...actions,
    localModelStates,
  };
};
