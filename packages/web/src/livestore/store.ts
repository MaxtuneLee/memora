import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import {
  IntentionalShutdownCause,
  Schema,
  StoreRegistry,
  storeOptions,
  type BootStatus,
} from "@livestore/livestore";
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

// Set in Settings > Sync. It lives in localStorage because the store needs it before it starts.
// ponytail: the password is stored as plain text there; seal it like API keys before release.
const SYNC_CONFIG_KEY = "memora.webdavSync";

export const readWebdavSyncPayload = (): WebdavSyncPayload | undefined => {
  try {
    return parseWebdavSyncPayload(JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) ?? "null"));
  } catch {
    return undefined;
  }
};

/** Every tab reloads when it hears this, so all of them start with the new sync config. */
export const SYNC_CONFIG_CHANNEL = "memora.sync-config";

/**
 * Saves the sync config (or turns sync off with `undefined`) and restarts LiveStore. The leader
 * worker keeps the config it started with, so it is shut down; every tab then reloads and starts
 * a new one.
 */
export const saveWebdavSyncPayload = (payload: WebdavSyncPayload | undefined): void => {
  if (payload) localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(payload));
  else localStorage.removeItem(SYNC_CONFIG_KEY);

  const shutdown = new BroadcastChannel(`livestore.shutdown.${appStoreOptions.storeId}`);
  shutdown.postMessage(
    Schema.encodeSync(IntentionalShutdownCause)(
      new IntentionalShutdownCause({ reason: "adapter-reset" }),
    ),
  );
  shutdown.close();
  const reload = new BroadcastChannel(SYNC_CONFIG_CHANNEL);
  reload.postMessage("reload");
  reload.close();
  // Give the shared worker time to drop the old leader before this tab starts a new one.
  setTimeout(() => window.location.reload(), 500);
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
