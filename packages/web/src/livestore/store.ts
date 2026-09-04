import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { StoreRegistry, storeOptions, type BootStatus } from "@livestore/livestore";
import { useStore } from "@livestore/react";
import { useSyncExternalStore } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import LiveStoreWorker from "@/workers/livestore.worker?worker";
import { schema } from "./schema";
import {
  createLiveStoreLoadingStatus,
  type LiveStoreLoadingStatus,
} from "@/app/liveStoreLoadingStatus";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

let loadingStatus: LiveStoreLoadingStatus = { stage: "loading" };
const loadingStatusListeners = new Set<() => void>();

function updateLoadingStatus(status: BootStatus): void {
  loadingStatus = createLiveStoreLoadingStatus(status);
  loadingStatusListeners.forEach((listener) => listener());
}

function subscribeToLoadingStatus(listener: () => void): () => void {
  loadingStatusListeners.add(listener);
  return () => loadingStatusListeners.delete(listener);
}

function getLoadingStatus(): LiveStoreLoadingStatus {
  return loadingStatus;
}

export const appStoreOptions = storeOptions({
  schema,
  adapter,
  storeId: "main",
  syncPayload: { authToken: "insecure-token-change-me" },
  onBootStatus: updateLoadingStatus,
});

export const appStoreRegistry = new StoreRegistry({
  defaultOptions: { batchUpdates },
});

export function useAppStore() {
  return useStore(appStoreOptions);
}

export function useLiveStoreLoadingStatus(): LiveStoreLoadingStatus {
  return useSyncExternalStore(
    subscribeToLoadingStatus,
    getLoadingStatus,
    getLoadingStatus,
  );
}
