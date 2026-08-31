/// <reference lib="webworker" />

import * as SQLite from "@livestore/wa-sqlite";
import SQLiteESMFactory from "@livestore/wa-sqlite/dist/wa-sqlite.mjs";
import { AccessHandlePoolVFS } from "@livestore/wa-sqlite/src/examples/AccessHandlePoolVFS.js";
import type { PreparedBindValues, SqliteDb } from "@livestore/livestore";
import { sqliteDbFactory } from "@livestore/sqlite-wasm/browser";
import { loadSqlite3Wasm } from "@livestore/sqlite-wasm/load-wasm";
import { Effect } from "@livestore/utils/effect";
import { Opfs } from "@livestore/utils/effect/browser";

const OLD_DIRECTORY = "livestore-main@4";
const NEW_DIRECTORY = "livestore-main@6";
const MIGRATION_MARKER = "memora-livestore-main-v4-to-v6.complete";
const MIGRATION_LOCK = "memora-livestore-main-v4-to-v6";
const LIVESTORE_TAB_LOCK = "livestore-tab-lock-main";
const MIGRATION_WRITER = "livestore-sqlite-wasm-0.4";
const EVENTLOG_FILE = "eventlog.db";

type SqlValue = string | number | bigint | Uint8Array<ArrayBuffer> | null;
type LegacyEventRow = [
  seqNumGlobal: SqlValue,
  seqNumClient: SqlValue,
  parentSeqNumGlobal: SqlValue,
  parentSeqNumClient: SqlValue,
  name: SqlValue,
  argsJson: SqlValue,
  clientId: SqlValue,
  sessionId: SqlValue,
  schemaHash: SqlValue,
  syncMetadataJson: SqlValue,
];

interface LegacyEventlog {
  events: LegacyEventRow[];
  syncHeads: SqlValue[];
}

type MigrationVfs = AccessHandlePoolVFS & {
  close: () => Promise<void>;
};

interface SQLiteWasmModule {
  _sqlite3_next_stmt: (db: number, statement: number) => number;
  _sqlite3_finalize: (statement: number) => number;
}

type MigrationResponse =
  | { ok: true; migrated: boolean; eventCount: number }
  | { ok: false; error: string };

interface MigrationMarker {
  eventCount: number;
  writer: string;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

async function readMigrationMarker(): Promise<MigrationMarker | undefined> {
  const root = await navigator.storage.getDirectory();

  try {
    const handle = await root.getFileHandle(MIGRATION_MARKER, { create: false });
    const value = JSON.parse(await (await handle.getFile()).text()) as Partial<MigrationMarker>;
    if (
      typeof value.eventCount !== "number" ||
      !Number.isSafeInteger(value.eventCount) ||
      value.eventCount < 0 ||
      value.writer !== MIGRATION_WRITER
    ) {
      return undefined;
    }
    return { eventCount: value.eventCount, writer: value.writer };
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function hasDirectory(name: string): Promise<boolean> {
  const root = await navigator.storage.getDirectory();

  try {
    await root.getDirectoryHandle(name, { create: false });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

function assertIntegrity(sqlite3: SQLite.SQLiteAPI, db: number, directory: string): void {
  let result: SqlValue | undefined;
  sqlite3.exec(db, "PRAGMA integrity_check", (row) => {
    result = row[0] as SqlValue;
  });

  if (result !== "ok") {
    throw new Error(`SQLite integrity check failed for ${directory}: ${String(result)}`);
  }
}

function finalizeRemainingStatements(module: SQLiteWasmModule, db: number): void {
  let statement = module._sqlite3_next_stmt(db, 0);
  while (statement !== 0) {
    const nextStatement = module._sqlite3_next_stmt(db, statement);
    module._sqlite3_finalize(statement);
    statement = nextStatement;
  }
}

async function readLegacyEventlog(
  sqlite3: SQLite.SQLiteAPI,
  module: SQLiteWasmModule,
): Promise<LegacyEventlog> {
  const vfs = (await AccessHandlePoolVFS.create(OLD_DIRECTORY, module)) as MigrationVfs;
  sqlite3.vfs_register(vfs as unknown as Parameters<typeof sqlite3.vfs_register>[0], false);
  let db: number | undefined;

  try {
    db = sqlite3.open_v2Sync(EVENTLOG_FILE, SQLite.SQLITE_OPEN_READWRITE, OLD_DIRECTORY);
    assertIntegrity(sqlite3, db, OLD_DIRECTORY);

    const events: LegacyEventRow[] = [];
    sqlite3.exec(
      db,
      `SELECT
        seqNumGlobal,
        seqNumClient,
        parentSeqNumGlobal,
        parentSeqNumClient,
        name,
        argsJson,
        clientId,
        sessionId,
        schemaHash,
        syncMetadataJson
      FROM eventlog
      ORDER BY seqNumGlobal, seqNumClient`,
      (row) => events.push(row as LegacyEventRow),
    );

    const syncHeads: SqlValue[] = [];
    sqlite3.exec(db, "SELECT head FROM __livestore_sync_status ORDER BY head", (row) => {
      syncHeads.push(row[0] as SqlValue);
    });

    return { events, syncHeads };
  } finally {
    if (db !== undefined) {
      finalizeRemainingStatements(module, db);
      sqlite3.close(db);
    }
    await vfs.close();
  }
}

function createV6EventlogSchema(db: SqliteDb): void {
  db.execute(
    `CREATE TABLE eventlog (
      seqNumGlobal INTEGER NOT NULL,
      seqNumClient INTEGER NOT NULL,
      seqNumRebaseGeneration INTEGER NOT NULL,
      parentSeqNumGlobal INTEGER NOT NULL,
      parentSeqNumClient INTEGER NOT NULL,
      parentSeqNumRebaseGeneration INTEGER NOT NULL,
      name TEXT NOT NULL,
      argsJson TEXT NOT NULL,
      clientId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      schemaHash INTEGER NOT NULL,
      syncMetadataJson TEXT NOT NULL,
      PRIMARY KEY (seqNumGlobal, seqNumClient, seqNumRebaseGeneration)
    )`,
  );
  db.execute("CREATE INDEX idx_eventlog_seqNumGlobal ON eventlog (seqNumGlobal)");
  db.execute(
    `CREATE INDEX idx_eventlog_seqNum ON eventlog (
      seqNumGlobal, seqNumClient, seqNumRebaseGeneration
    )`,
  );
  db.execute(
    `CREATE TABLE __livestore_sync_status (
      head INTEGER PRIMARY KEY,
      backendId TEXT
    )`,
  );
}

function normalizeBindValue(value: SqlValue): string | number | Uint8Array<ArrayBuffer> | null {
  if (typeof value !== "bigint") return value;
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new Error(`SQLite integer ${value} cannot be represented safely during migration`);
  }
  return numberValue;
}

function insertLegacyRows(db: SqliteDb, legacy: LegacyEventlog): void {
  const eventStatement = db.prepare(
    `INSERT INTO eventlog (
      seqNumGlobal,
      seqNumClient,
      seqNumRebaseGeneration,
      parentSeqNumGlobal,
      parentSeqNumClient,
      parentSeqNumRebaseGeneration,
      name,
      argsJson,
      clientId,
      sessionId,
      schemaHash,
      syncMetadataJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const syncStatement = db.prepare(
    "INSERT INTO __livestore_sync_status (head, backendId) VALUES (?, ?)",
  );
  db.execute("BEGIN IMMEDIATE");

  try {
    for (const event of legacy.events) {
      eventStatement.execute([
        normalizeBindValue(event[0]),
        normalizeBindValue(event[1]),
        0,
        normalizeBindValue(event[2]),
        normalizeBindValue(event[3]),
        0,
        ...event.slice(4).map(normalizeBindValue),
      ] as unknown as PreparedBindValues);
    }

    for (const head of legacy.syncHeads) {
      syncStatement.execute([normalizeBindValue(head), null] as unknown as PreparedBindValues);
    }

    db.execute("COMMIT");
  } catch (error) {
    db.execute("ROLLBACK");
    throw error;
  } finally {
    eventStatement.finalize();
    syncStatement.finalize();
  }
}

function assertOfficialIntegrity(db: SqliteDb): void {
  const result = db.select<{ integrity_check: string }>("PRAGMA integrity_check")[0]
    ?.integrity_check;
  if (result !== "ok") {
    throw new Error(`SQLite integrity check failed for ${NEW_DIRECTORY}: ${String(result)}`);
  }
}

function readOfficialEventCount(db: SqliteDb): number {
  return db.select<{ count: number }>("SELECT COUNT(*) AS count FROM eventlog")[0]?.count ?? -1;
}

function withOfficialV6Db<A>(create: boolean, use: (db: SqliteDb) => A): Promise<A> {
  const program = Effect.gen(function* () {
    const sqlite3 = yield* Effect.promise(() => loadSqlite3Wasm());
    const makeSqliteDb = sqliteDbFactory({ sqlite3 });
    const db = yield* Effect.acquireRelease(
      makeSqliteDb({
        _tag: "opfs",
        opfsDirectory: NEW_DIRECTORY,
        fileName: EVENTLOG_FILE,
      }),
      (database) => Effect.sync(() => database.close()),
    );

    if (!create && readOfficialEventCount(db) < 0) {
      return yield* Effect.dieMessage("Migrated LiveStore eventlog is missing");
    }

    return use(db);
  }).pipe(Effect.scoped, Effect.provide(Opfs.Opfs.Default));

  return Effect.runPromise(program);
}

async function validateV6Eventlog(expectedEventCount: number): Promise<boolean> {
  if (!(await hasDirectory(NEW_DIRECTORY))) return false;

  try {
    return await withOfficialV6Db(false, (db) => {
      assertOfficialIntegrity(db);
      const columns = new Set(
        db.select<{ name: string }>("PRAGMA table_info(eventlog)").map((row) => row.name),
      );
      return (
        columns.has("seqNumRebaseGeneration") &&
        columns.has("parentSeqNumRebaseGeneration") &&
        readOfficialEventCount(db) === expectedEventCount
      );
    });
  } catch {
    return false;
  }
}

async function writeV6Eventlog(legacy: LegacyEventlog): Promise<void> {
  const root = await navigator.storage.getDirectory();

  try {
    await root.removeEntry(NEW_DIRECTORY, { recursive: true });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  await withOfficialV6Db(true, (db) => {
    createV6EventlogSchema(db);
    insertLegacyRows(db, legacy);
    assertOfficialIntegrity(db);

    const migratedCount = readOfficialEventCount(db);
    if (migratedCount !== legacy.events.length) {
      throw new Error(
        `LiveStore event count mismatch after migration: expected ${legacy.events.length}, got ${migratedCount}`,
      );
    }
  });
}

async function writeMigrationMarker(eventCount: number): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const marker = await root.getFileHandle(MIGRATION_MARKER, { create: true });
  const writable = await marker.createWritable();
  await writable.write(
    JSON.stringify({
      source: OLD_DIRECTORY,
      target: NEW_DIRECTORY,
      eventCount,
      writer: MIGRATION_WRITER,
      completedAt: new Date().toISOString(),
    }),
  );
  await writable.close();
}

async function migrateWithLock(): Promise<MigrationResponse> {
  return navigator.locks.request(MIGRATION_LOCK, async () => {
    const marker = await readMigrationMarker();
    if (marker !== undefined && (await validateV6Eventlog(marker.eventCount))) {
      return { ok: true, migrated: false, eventCount: 0 };
    }

    if (!(await hasDirectory(OLD_DIRECTORY))) {
      if (marker !== undefined) {
        throw new Error(
          "The LiveStore migration marker exists, but the migrated eventlog is missing or invalid and storage format 4 is unavailable.",
        );
      }
      return { ok: true, migrated: false, eventCount: 0 };
    }

    const module = (await SQLiteESMFactory()) as SQLiteWasmModule;
    const sqlite3 = SQLite.Factory(module);
    const legacy = await readLegacyEventlog(sqlite3, module);

    await writeV6Eventlog(legacy);
    await writeMigrationMarker(legacy.events.length);

    return { ok: true, migrated: true, eventCount: legacy.events.length };
  });
}

async function migrate(): Promise<MigrationResponse> {
  return navigator.locks.request(
    LIVESTORE_TAB_LOCK,
    { ifAvailable: true, mode: "exclusive" },
    (lock) => {
      if (lock === null) {
        throw new Error("Another Memora tab is using LiveStore. Close it, then reload this page.");
      }
      return migrateWithLock();
    },
  );
}

self.addEventListener("message", (event: MessageEvent<{ type?: string }>) => {
  if (event.data.type !== "migrate") return;

  void migrate()
    .then((result) => self.postMessage(result))
    .catch((error: unknown) => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      self.postMessage({ ok: false, error: message } satisfies MigrationResponse);
    });
});
