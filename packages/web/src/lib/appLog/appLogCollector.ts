import { file as opfsFile, write as opfsWrite } from "@memora/fs";
import { queryDb } from "@livestore/livestore";

import { saveFileToOpfs } from "@/lib/library/fileStorage";
import { commitFileCreated } from "@/lib/widgets/widgetManifestFile";
import { fileEvents, fileTable, type file as LiveStoreFile } from "@/livestore/file";

import { formatLogEntry } from "./appLogFormat";

export const APP_LOG_FILE_NAME = "memora-debug.log";
export const APP_LOG_MAX_BYTES = 50 * 1024 * 1024;
const APP_LOG_MIME_TYPE = "text/plain";
const FLUSH_INTERVAL_MS = 5000;
const SIZE_SYNC_INTERVAL_MS = 60_000;
const MAX_BUFFERED_ENTRIES = 2000;
const LEVELS = ["debug", "log", "info", "warn", "error"] as const;

type LogLevel = (typeof LEVELS)[number];

const appLogFileQuery$ = queryDb(
  () =>
    fileTable.where({
      name: APP_LOG_FILE_NAME,
      parentId: null,
      deletedAt: null,
      purgedAt: null,
    }),
  { label: "app-log:file" },
);

interface LogStore {
  commit: (...events: unknown[]) => void;
  query: (query: typeof appLogFileQuery$) => readonly LiveStoreFile[];
}

export const isAppLogFile = (file: Pick<LiveStoreFile, "name" | "parentId">): boolean =>
  file.name === APP_LOG_FILE_NAME && !file.parentId;

export const findAppLogFile = (store: LogStore): LiveStoreFile | null =>
  store.query(appLogFileQuery$)[0] ?? null;

// ponytail: OPFS has no append, so this rewrites from the end with keepExistingData. Past the
// cap it keeps the newest half, starting at a line boundary.
const appendCapped = async (path: string, chunk: string): Promise<number> => {
  const origin = await opfsFile(path).getOriginFile();
  const bytes = new TextEncoder().encode(chunk);
  const writable = await getWritable(path);
  await writable.seek(origin.size);
  await writable.write(bytes);
  await writable.close();

  const size = origin.size + bytes.byteLength;
  if (size <= APP_LOG_MAX_BYTES) return size;

  const tail = await (await opfsFile(path).getOriginFile()).slice(size - APP_LOG_MAX_BYTES / 2).text();
  const kept = tail.slice(tail.indexOf("\n") + 1);
  await opfsWrite(path, kept, { overwrite: true });
  return new TextEncoder().encode(kept).byteLength;
};

const getWritable = async (path: string): Promise<FileSystemWritableFileStream> => {
  let directory = await navigator.storage.getDirectory();
  const segments = path.split("/").filter(Boolean);
  const name = segments.pop();
  if (!name) throw new Error("Log file path is empty.");
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
  const handle = await directory.getFileHandle(name);
  return handle.createWritable({ keepExistingData: true });
};

// Mirrors console output and uncaught errors into memora-debug.log on the Desktop.
export const startAppLogCollection = (store: LogStore): (() => void) => {
  const original = Object.fromEntries(LEVELS.map((level) => [level, console[level]])) as Record<
    LogLevel,
    (...args: unknown[]) => void
  >;
  let buffer: string[] = [];
  let flushing = false;
  let lastSizeSync = 0;

  const record = (level: string, args: readonly unknown[]): void => {
    buffer.push(formatLogEntry(level, args));
    if (buffer.length > MAX_BUFFERED_ENTRIES) buffer = buffer.slice(-MAX_BUFFERED_ENTRIES);
  };

  const flush = async (): Promise<void> => {
    if (flushing || buffer.length === 0) return;
    flushing = true;
    const chunk = buffer.join("");
    buffer = [];
    try {
      const existing = findAppLogFile(store);
      if (!existing) {
        const { meta } = await saveFileToOpfs({
          blob: new Blob([chunk], { type: APP_LOG_MIME_TYPE }),
          name: APP_LOG_FILE_NAME,
          type: "document",
          mimeType: APP_LOG_MIME_TYPE,
          parentId: null,
        });
        commitFileCreated(store, meta);
        lastSizeSync = Date.now();
        return;
      }
      const size = await appendCapped(existing.storagePath, chunk);
      // ponytail: size syncs to the file row at most once a minute so logging doesn't flood
      // the event log; the meta sidecar's size stays at its creation value.
      if (Date.now() - lastSizeSync >= SIZE_SYNC_INTERVAL_MS) {
        lastSizeSync = Date.now();
        store.commit(
          fileEvents.fileUpdated({ id: existing.id, sizeBytes: size, updatedAt: new Date() }),
        );
      }
    } catch (error) {
      original.warn("Could not write the debug log", error);
    } finally {
      flushing = false;
    }
  };

  for (const level of LEVELS) {
    console[level] = (...args: unknown[]) => {
      original[level](...args);
      record(level, args);
    };
  }
  const handleError = (event: ErrorEvent): void => {
    record("uncaught", [event.error ?? event.message]);
  };
  const handleRejection = (event: PromiseRejectionEvent): void => {
    record("unhandled-rejection", [event.reason]);
  };
  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  record("info", [
    `Log collection started. Memora ${__APP_VERSION__}, ${import.meta.env.MODE}, ${navigator.userAgent}`,
  ]);
  const intervalId = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
    for (const level of LEVELS) console[level] = original[level];
    void flush();
  };
};

export const downloadAppLog = async (store: LogStore): Promise<boolean> => {
  const logFile = findAppLogFile(store);
  if (!logFile) return false;
  const blob = await opfsFile(logFile.storagePath).getOriginFile();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = APP_LOG_FILE_NAME;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};
