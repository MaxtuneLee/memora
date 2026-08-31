import LiveStoreStorageMigrationWorker from "@/workers/livestore-storage-migration.worker?worker";

export interface LiveStoreStorageMigrationResult {
  migrated: boolean;
  eventCount: number;
}

type WorkerResponse =
  | ({ ok: true } & LiveStoreStorageMigrationResult)
  | { ok: false; error: string };

let migrationPromise: Promise<LiveStoreStorageMigrationResult> | undefined;

function runMigrationWorker(): Promise<LiveStoreStorageMigrationResult> {
  const worker = new LiveStoreStorageMigrationWorker();

  return new Promise((resolve, reject) => {
    worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResponse>) => {
        worker.terminate();

        if (event.data.ok) {
          resolve(event.data);
          return;
        }

        reject(new Error(event.data.error));
      },
      { once: true },
    );
    worker.addEventListener(
      "error",
      (event) => {
        worker.terminate();
        reject(event.error instanceof Error ? event.error : new Error(event.message));
      },
      { once: true },
    );
    worker.postMessage({ type: "migrate" });
  });
}

export function migrateLiveStoreStorageFormat(): Promise<LiveStoreStorageMigrationResult> {
  migrationPromise ??= runMigrationWorker();
  return migrationPromise;
}
