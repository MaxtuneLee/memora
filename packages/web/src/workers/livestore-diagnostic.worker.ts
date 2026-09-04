/// <reference lib="webworker" />

import { Schema } from "@livestore/livestore";
import { sqliteDbFactory } from "@livestore/sqlite-wasm/browser";
import { loadSqlite3Wasm } from "@livestore/sqlite-wasm/load-wasm";
import { Effect } from "@livestore/utils/effect";
import { Opfs } from "@livestore/utils/effect/browser";

import { schema } from "@/livestore/schema";

const diagnose = Effect.gen(function* () {
  const sqlite3 = yield* Effect.promise(() => loadSqlite3Wasm());
  const makeSqliteDb = sqliteDbFactory({ sqlite3 });
  const db = yield* makeSqliteDb({
    _tag: "opfs",
    opfsDirectory: "livestore-main@6",
    fileName: "eventlog.db",
  });
  yield* Effect.addFinalizer(() => Effect.sync(() => db.close()));

  const eventNames = db.select<{ name: string; count: number }>(
    "SELECT name, COUNT(*) AS count FROM eventlog GROUP BY name ORDER BY COUNT(*) DESC, name",
  );
  const events = db.select<{
    seqNumGlobal: number;
    seqNumClient: number;
    name: string;
    argsJson: string;
  }>(
    "SELECT seqNumGlobal, seqNumClient, name, argsJson FROM eventlog ORDER BY seqNumGlobal, seqNumClient",
  );

  const invalidEvents: Array<{
    seqNumGlobal: string;
    seqNumClient: string;
    name: string;
    error: string;
  }> = [];
  for (const event of events) {
    if (invalidEvents.length >= 50) break;
    try {
      const args = JSON.parse(event.argsJson) as unknown;
      const eventDefinition = schema.eventsDefsMap.get(event.name);
      if (eventDefinition !== undefined) {
        Schema.decodeUnknownSync(eventDefinition.schema)(args);
      }
    } catch (error) {
      invalidEvents.push({
        seqNumGlobal: String(event.seqNumGlobal),
        seqNumClient: String(event.seqNumClient),
        name: event.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    schemaHash: schema.state.sqlite.hash,
    totalEvents: events.length,
    eventNames,
    invalidEvents,
    syncStatus: db.select<{ head: number; backendId: string | null }>(
      "SELECT head, backendId FROM __livestore_sync_status",
    ),
  };
}).pipe(Effect.scoped, Effect.provide(Opfs.Opfs.Default));

void Effect.runPromise(diagnose)
  .then((result) => self.postMessage({ ok: true, result }))
  .catch((error: unknown) => {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  });
