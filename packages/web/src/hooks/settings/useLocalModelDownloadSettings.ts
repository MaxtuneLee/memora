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
  type LocalModelDownloadState,
} from "@/lib/local-model/downloadState";

export type {
  LocalModelDownloadFileState,
  LocalModelDownloadState,
} from "@/lib/local-model/downloadState";

const DEFAULT_LOCAL_MODEL_OPTIONS = getAllLocalModelOptions();

let sharedLocalModelStates: Record<string, LocalModelDownloadState> = {};
const localModelStateListeners = new Set<() => void>();

const getLocalModelStateSnapshot = (): Record<string, LocalModelDownloadState> => {
  return sharedLocalModelStates;
};

const subscribeToLocalModelStates = (listener: () => void): (() => void) => {
  localModelStateListeners.add(listener);
  return () => {
    localModelStateListeners.delete(listener);
  };
};

const publishLocalModelStates = (
  update: (
    current: Record<string, LocalModelDownloadState>,
  ) => Record<string, LocalModelDownloadState>,
): void => {
  sharedLocalModelStates = update(sharedLocalModelStates);
  localModelStateListeners.forEach((listener) => listener());
};

const setLocalModelState = (modelId: string, state: LocalModelDownloadState): void => {
  publishLocalModelStates((current) => ({
    ...current,
    [modelId]: state,
  }));
};

export const getLocalModelOptions = (): LocalModelOption[] => {
  return DEFAULT_LOCAL_MODEL_OPTIONS;
};

interface UseLocalModelDownloadSettingsOptions {
  open: boolean;
  modelOptions?: LocalModelOption[];
}

export const useLocalModelDownloadSettings = ({
  open,
  modelOptions = DEFAULT_LOCAL_MODEL_OPTIONS,
}: UseLocalModelDownloadSettingsOptions) => {
  const { add } = Toast.useToastManager();
  const localModelStates = useSyncExternalStore(
    subscribeToLocalModelStates,
    getLocalModelStateSnapshot,
    getLocalModelStateSnapshot,
  );

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
      const controller = new AbortController();
      await clearLocalModelCacheMarker(modelId);
      setLocalModelState(modelId, { status: "downloading", progress: 0, files: [] });

      try {
        for await (const event of localModelClient.preloadModel(modelId, {
          priority: "background",
          signal: controller.signal,
        })) {
          if (event.type === "model-progress") {
            publishLocalModelStates((current) => ({
              ...current,
              [modelId]: applyLocalModelProgressEvent(
                current[modelId] ?? { status: "downloading", progress: 0, files: [] },
                event,
              ),
            }));
          }

          if (event.type === "error") {
            throw new Error(event.error.message);
          }
        }

        await writeLocalModelCacheMarker(modelId);
        await refreshLocalModelState(modelId);
        add({ title: "Local model ready", type: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Download failed";
        setLocalModelState(modelId, { status: "error", error: message });
        add({ title: "Failed to download local model", description: message, type: "error" });
      }
    },
    [add, refreshLocalModelState],
  );

  return {
    localModelOptions: modelOptions,
    localModelStates,
    handleDownloadLocalModel,
    refreshLocalModelState,
  };
};
