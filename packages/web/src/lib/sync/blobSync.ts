import { queryDb } from "@livestore/livestore";
import {
  cat as opfsCat,
  file as opfsFile,
  ls as opfsLs,
  write as opfsWrite,
  writeStream,
} from "@memora/fs";
import { useSyncExternalStore } from "react";

import { fileTable } from "@/livestore/file";
import type { useAppStore } from "@/livestore/store";
import { UploadGoneError, type BlobProvider, type UploadedPart } from "./blobProvider";

/**
 * Moves file contents between OPFS and object storage. The event log already says which version
 * each file should have (`contentKey`, `transcriptKey`); this module makes the bytes follow:
 * versions written on this device are uploaded, small versions written elsewhere are downloaded in
 * the background, large ones when the file is opened, and purged files are deleted everywhere.
 */

type SyncStore = Pick<ReturnType<typeof useAppStore>, "query" | "clientId">;

export type UploadProgress = { uploadId: string; size: number; parts: UploadedPart[] };

/** Absent for files whose contents are on this device (or when sync is off). */
export type FileSyncStatus = { state: "remote" } | { state: "downloading"; progress: number };

// One marker file per key, so tabs can record their own transfers without overwriting each other.
// Markers are kept per storage location: switching servers starts from nothing.
let DONE_DIR = "";
let UPLOADS_DIR = "";
let PURGED_DIR = "";
const PASS_INTERVAL_MS = 5000;
/** Contents up to one upload part download in the background; larger files wait until opened. */
const AUTO_DOWNLOAD_MAX_BYTES = 8 * 1024 * 1024;

const syncedFiles$ = queryDb(
  () =>
    fileTable.select(
      "id",
      "storageType",
      "storagePath",
      "sizeBytes",
      "transcriptPath",
      "contentKey",
      "transcriptKey",
      "deletedAt",
      "purgedAt",
    ),
  { label: "sync:file-contents" },
);

type FileRow = {
  id: string;
  storageType: string;
  storagePath: string;
  sizeBytes: number;
  transcriptPath: string | null;
  contentKey: string | null;
  transcriptKey: string | null;
  deletedAt: Date | null;
  purgedAt: Date | null;
};

type Version = { kind: "content" | "transcript"; key: string; path: string; isOwn: boolean };

const marker = (dir: string, key: string): string => `${dir}/${encodeURIComponent(key)}`;
const exists = (path: string): Promise<boolean> => opfsFile(path).exists();
const touch = (path: string): Promise<void> => opfsWrite(path, "", { overwrite: true });

/** Uploads `blob` in `provider.partSize` parts, resuming `progress` when it still fits. */
export const uploadBlob = async ({
  provider,
  key,
  blob,
  progress,
  onProgress,
}: {
  provider: BlobProvider;
  key: string;
  blob: Blob;
  progress?: UploadProgress;
  onProgress: (progress: UploadProgress) => Promise<void>;
}): Promise<void> => {
  let current = progress?.size === blob.size ? progress : undefined;
  if (progress && !current) await provider.abortUpload(key, progress.uploadId);

  for (let attempt = 0; attempt < 2; attempt++) {
    current ??= {
      uploadId: await provider.createUpload(key, blob.type || "application/octet-stream"),
      size: blob.size,
      parts: [],
    };
    await onProgress(current);
    try {
      const count = Math.max(1, Math.ceil(blob.size / provider.partSize));
      for (let partNumber = 1; partNumber <= count; partNumber++) {
        if (current.parts.some((part) => part.partNumber === partNumber)) continue;
        const start = (partNumber - 1) * provider.partSize;
        const part = await provider.uploadPart(
          key,
          current.uploadId,
          partNumber,
          blob.slice(start, start + provider.partSize),
        );
        current = { ...current, parts: [...current.parts, part] };
        await onProgress(current);
      }
      const parts = [...current.parts].sort((a, b) => a.partNumber - b.partNumber);
      await provider.completeUpload(key, current.uploadId, parts);
      return;
    } catch (error) {
      // A resumed upload may have expired on the server; start it over once.
      if (!(error instanceof UploadGoneError) || attempt > 0) throw error;
      current = undefined;
    }
  }
};

/**
 * `changed`: the server is not the one this device synced with before (it was reset or
 * replaced). LiveStore stops syncing events then, so files stop too.
 */
export type SyncServerState = "unknown" | "same" | "changed";

let session: { store: SyncStore; storeId: string; provider: BlobProvider } | null = null;
let serverState: SyncServerState = "unknown";

const statuses = new Map<string, FileSyncStatus>();
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<void>>();

const sameStatus = (a: FileSyncStatus | undefined, b: FileSyncStatus | undefined): boolean =>
  a?.state === b?.state &&
  (a?.state !== "downloading" || (b?.state === "downloading" && a.progress === b.progress));

const setStatus = (fileId: string, status: FileSyncStatus | undefined): void => {
  if (sameStatus(statuses.get(fileId), status)) return;
  if (status) statuses.set(fileId, status);
  else statuses.delete(fileId);
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getFileSyncStatus = (fileId: string): FileSyncStatus | undefined =>
  statuses.get(fileId);

export const useFileSyncStatus = (fileId: string): FileSyncStatus | undefined =>
  useSyncExternalStore(subscribe, () => statuses.get(fileId));

/** How many files have contents on another device that this device has not downloaded. */
export const useRemoteFileCount = (): number =>
  useSyncExternalStore(subscribe, () => statuses.size);

export const useSyncServerState = (): SyncServerState =>
  useSyncExternalStore(subscribe, () => serverState);

const versionsOf = (row: FileRow, clientId: string): Version[] => {
  const versions: Version[] = [];
  if (row.contentKey && row.storagePath && row.storageType === "opfs") {
    versions.push({ kind: "content", key: row.contentKey, path: row.storagePath, isOwn: false });
  }
  if (row.transcriptKey && row.transcriptPath) {
    versions.push({
      kind: "transcript",
      key: row.transcriptKey,
      path: row.transcriptPath,
      isOwn: false,
    });
  }
  return versions.map((version) => ({
    ...version,
    isOwn: version.key.startsWith(`files/${row.id}/${version.kind}-${clientId}-`),
  }));
};

const missingVersions = async (
  row: FileRow,
  storeId: string,
  clientId: string,
): Promise<Version[]> => {
  const missing: Version[] = [];
  for (const version of versionsOf(row, clientId)) {
    // An own version is missing only if this device lost its copy (for example, cleared storage).
    if (version.isOwn && (await exists(version.path))) continue;
    if (!(await exists(marker(DONE_DIR, `${storeId}/${version.key}`)))) missing.push(version);
  }
  return missing;
};

const refreshStatus = async (row: FileRow): Promise<void> => {
  if (!session || inFlight.has(row.id)) return;
  if (row.purgedAt) {
    setStatus(row.id, undefined);
    return;
  }
  const missing = await missingVersions(row, session.storeId, session.store.clientId);
  setStatus(row.id, missing.length > 0 ? { state: "remote" } : undefined);
};

const download = (row: FileRow, versions: readonly Version[]): Promise<void> => {
  const existing = inFlight.get(row.id);
  if (existing) return existing;
  if (!session || versions.length === 0) return Promise.resolve();
  const { storeId, provider } = session;

  const run = (async () => {
    setStatus(row.id, { state: "downloading", progress: 0 });
    for (const version of versions) {
      const fullKey = `${storeId}/${version.key}`;
      const stream = await provider.download(fullKey);
      if (!stream) throw new Error("The device that added this file has not uploaded it yet.");

      let received = 0;
      const counted =
        version.kind === "content" && row.sizeBytes > 0
          ? stream.pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                  received += chunk.byteLength;
                  const progress = Math.min(1, Math.floor((received / row.sizeBytes) * 100) / 100);
                  setStatus(row.id, { state: "downloading", progress });
                  controller.enqueue(chunk);
                },
              }),
            )
          : stream;
      // OPFS swaps the file in only when the write completes, so a failed download leaves the old
      // contents in place.
      await writeStream(version.path, counted, { overwrite: true });
      await touch(marker(DONE_DIR, fullKey));
    }
  })().finally(() => {
    inFlight.delete(row.id);
    setStatus(row.id, undefined);
    void refreshStatus(row);
  });
  inFlight.set(row.id, run);
  return run;
};

/**
 * Downloads a file's contents if another device wrote the current version. Resolves at once when
 * they are already here or sync is off. Callers open the file afterwards.
 */
export const ensureFileLocal = async (fileId: string): Promise<void> => {
  if (!session) return;
  const { store, storeId } = session;
  const row = (store.query(syncedFiles$) as readonly FileRow[]).find((item) => item.id === fileId);
  if (!row || row.purgedAt) return;
  await download(row, await missingVersions(row, storeId, store.clientId));
};

const uploadOwn = async (version: Version, fullKey: string): Promise<void> => {
  if (!session) return;
  const local = opfsFile(version.path);
  const progressPath = `${marker(UPLOADS_DIR, fullKey)}.json`;
  const saved = (await exists(progressPath))
    ? (JSON.parse(await opfsCat(progressPath)) as UploadProgress)
    : undefined;
  await uploadBlob({
    provider: session.provider,
    key: fullKey,
    blob: await local.getOriginFile(),
    progress: saved,
    onProgress: (progress) =>
      opfsWrite(progressPath, JSON.stringify(progress), { overwrite: true }),
  });
  await opfsFile(progressPath).remove({ force: true });
  await touch(marker(DONE_DIR, fullKey));
};

/** Purging a file deletes every stored version and this device's copy, like a WebDAV DELETE. */
const purge = async (row: FileRow, storeId: string, provider: BlobProvider): Promise<void> => {
  const purgedMarker = marker(PURGED_DIR, `${storeId}/${row.id}`);
  if (await exists(purgedMarker)) return;
  await provider.deletePrefix(`${storeId}/files/${row.id}/`);
  for (const path of [row.storagePath, row.transcriptPath]) {
    if (path) await opfsFile(path).remove({ force: true });
  }
  await touch(purgedMarker);
};

/** Uploads, background downloads and purges. Runs in one tab per browser. */
const runTransfers = async (): Promise<void> => {
  if (!session) return;
  const { store, storeId, provider } = session;
  const ownKeys = new Set<string>();

  for (const row of store.query(syncedFiles$) as readonly FileRow[]) {
    try {
      if (row.purgedAt) {
        await purge(row, storeId, provider);
        continue;
      }
      const background: Version[] = [];
      for (const version of versionsOf(row, store.clientId)) {
        const fullKey = `${storeId}/${version.key}`;
        if (version.isOwn) ownKeys.add(fullKey);
        if (await exists(marker(DONE_DIR, fullKey))) continue;
        if (version.isOwn && (await exists(version.path))) {
          await uploadOwn(version, fullKey);
        } else if (
          !row.deletedAt &&
          (version.kind === "transcript" || row.sizeBytes <= AUTO_DOWNLOAD_MAX_BYTES)
        ) {
          background.push(version);
        }
      }
      await download(row, background);
    } catch (error) {
      console.warn(`File sync failed for ${row.id}; retrying later.`, error);
    }
  }

  // A newer local version replaced these before they finished; nobody will read them.
  const pending = await opfsLs(UPLOADS_DIR, { includeDirs: false }).catch(() => []);
  for (const path of pending) {
    const fullKey = decodeURIComponent(path.slice(UPLOADS_DIR.length + 1).replace(/\.json$/, ""));
    if (ownKeys.has(fullKey)) continue;
    const progress = JSON.parse(await opfsCat(path)) as UploadProgress;
    await provider.abortUpload(fullKey, progress.uploadId).catch(() => undefined);
    await opfsFile(path).remove({ force: true });
  }
};

const refreshStatuses = async (): Promise<void> => {
  if (!session) return;
  for (const row of session.store.query(syncedFiles$) as readonly FileRow[]) {
    await refreshStatus(row);
  }
};

/**
 * Starts file sync for this tab. Every tab tracks which files are not here yet and can download a
 * file on open; one tab per browser (picked with a Web Lock) also uploads, downloads small files in
 * the background, and deletes purged files. Returns a stop function.
 */
export const startBlobSync = ({
  verifyServer,
  ...options
}: {
  store: SyncStore;
  storeId: string;
  provider: BlobProvider;
  /** Compares the server with the one this device synced with before. */
  verifyServer: () => Promise<SyncServerState>;
}): (() => void) => {
  session = options;
  const base = `/sync/${encodeURIComponent(options.provider.id)}`;
  DONE_DIR = `${base}/done`;
  UPLOADS_DIR = `${base}/uploads`;
  PURGED_DIR = `${base}/purged`;
  const controller = new AbortController();
  const { signal } = controller;
  const sleep = () => new Promise((resolve) => setTimeout(resolve, PASS_INTERVAL_MS));
  const serverIsSame = async (): Promise<boolean> => {
    if (serverState !== "same") {
      serverState = await verifyServer();
      listeners.forEach((listener) => listener());
    }
    return serverState === "same";
  };

  void (async () => {
    while (!signal.aborted) {
      if (await serverIsSame())
        await refreshStatuses().catch((error: unknown) => console.warn(error));
      await sleep();
    }
  })();

  navigator.locks
    .request("memora-blob-sync", { signal }, async () => {
      while (!signal.aborted) {
        if (await serverIsSame()) await runTransfers();
        await sleep();
      }
    })
    .catch((error: unknown) => {
      if (!signal.aborted) console.warn("File sync stopped.", error);
    });

  return () => {
    controller.abort();
    session = null;
    serverState = "unknown";
    statuses.clear();
    listeners.forEach((listener) => listener());
  };
};
