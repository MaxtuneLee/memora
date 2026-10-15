import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { StoreRegistry, storeOptions, type BootStatus } from "@livestore/livestore";
import { useStore } from "@livestore/react";
import { useSyncExternalStore } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import LiveStoreWorker from "@/workers/livestore.worker?worker";
import { schema } from "./schema";
import { parseWebdavSyncPayload, type WebdavSyncPayload } from "./webdavSync";
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

// ponytail: demo switch. Set `localStorage["memora.webdavSync"]` to
// `{"url":"https://dav.example.com/memora","username":"…","password":"…"}` and reload.
// Replace with a settings form (and keep the password out of localStorage) before shipping.
export const readWebdavSyncPayload = (): WebdavSyncPayload | undefined => {
  try {
    return parseWebdavSyncPayload(JSON.parse(localStorage.getItem("memora.webdavSync") ?? "null"));
  } catch {
    return undefined;
  }
};

export const appStoreOptions = storeOptions({
  schema,
  adapter,
  storeId: "main",
  syncPayload: readWebdavSyncPayload(),
  onBootStatus: updateLoadingStatus,
});

export const appStoreRegistry = new StoreRegistry({
  defaultOptions: { batchUpdates },
});

export function useAppStore() {
  return useStore(appStoreOptions);
}

export function useLiveStoreLoadingStatus(): LiveStoreLoadingStatus {
  return useSyncExternalStore(subscribeToLoadingStatus, getLoadingStatus, getLoadingStatus);
}
