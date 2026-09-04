import sqlite3InitModule from "sqlite-vec-wasm/dist/sqlite3-bundler-friendly.mjs";
import {
  getVectorDbIndexId,
  type VectorDbChunkBatch,
  type VectorDbChunkFingerprint,
  type VectorDbIndexConfig,
  type VectorDbIndexHealth,
  type VectorDbIndexInspection,
  type VectorDbIndexedChunkSummary,
  type VectorDbIndexedDocumentSummary,
  type VectorDbIndexedDocument,
  type VectorDbIndexedChunk,
  type VectorDbDocumentCheckpoint,
  type VectorDbDocumentFingerprint,
  type VectorDbDocumentIndexPlan,
  type VectorDbDocumentStatus,
  type VectorDbSearchHit,
  type VectorDbSearchRequest,
} from "../lib/vector-db/client";
import { getRrfContribution, normalizeRrfK } from "../lib/vector-db/reciprocalRankFusion";
import { filterSearchTerms } from "../lib/vector-db/searchTerms";
import type { ContentLocator } from "../lib/content/types";

type SqliteBindValue = string | number | ArrayBuffer | null;

interface SqliteStatement {
  bind(index: number, value: SqliteBindValue): SqliteStatement;
  step(): boolean;
  stepReset(): SqliteStatement;
  get(target: Record<string, unknown>): Record<string, unknown>;
  finalize(): void;
}

interface SqliteDatabase {
  readonly pointer: number;
  readonly filename: string;
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}

interface SqliteModule {
  readonly version: { libVersion: string };
  readonly oo1: {
    DB: new (filename: string, flags?: string, vfs?: string) => SqliteDatabase;
  };
  readonly capi: {
    sqlite3_deserialize(
      db: number,
      schema: string,
      data: number,
      size: bigint,
      allocatedSize: bigint,
      flags: number,
    ): number;
    sqlite3_js_db_export(db: SqliteDatabase): Uint8Array;
  };
  readonly wasm: {
    alloc(size: number): number;
    allocFromTypedArray(data: Uint8Array): number;
    dealloc(pointer: number): void;
  };
}

type SqliteInit = (options?: { locateFile?: (path: string) => string }) => Promise<SqliteModule>;

export interface VectorDbWorkerRequest {
  id: string;
  type:
    | "initialize"
    | "health"
    | "inspect"
    | "checkDocuments"
    | "prepareDocument"
    | "upsertChunkBatch"
    | "finalizeDocument"
    | "upsert"
    | "deleteDocument"
    | "search"
    | "reset"
    | "close";
  payload: unknown;
  indexConfig?: VectorDbIndexConfig;
}

export type VectorDbWorkerResponse =
  | {
      id: string;
      ok: true;
      type: VectorDbWorkerRequest["type"];
      payload: unknown;
    }
  | { id: string; ok: false; error: string };

let sqlite: SqliteModule | null = null;
let db: SqliteDatabase | null = null;
let config: VectorDbIndexConfig | null = null;
let indexId: string | null = null;
let persistent = false;

interface VectorDbStorageReadRequest {
  type: "storage-read";
  id: string;
  indexId: string;
}

interface VectorDbStorageWriteRequest {
  type: "storage-write";
  id: string;
  indexId: string;
  database: ArrayBuffer;
}

interface VectorDbStorageResponse {
  type: "storage-read-result" | "storage-write-result";
  id: string;
  ok: boolean;
  database?: ArrayBuffer;
  error?: string;
}

type VectorDbStorageRequest = VectorDbStorageReadRequest | VectorDbStorageWriteRequest;

const storagePorts = new Set<MessagePort>();
const pendingStorageRequests = new Map<
  string,
  { resolve: (response: VectorDbStorageResponse) => void; reject: (error: Error) => void }
>();

const requestStorage = (request: VectorDbStorageRequest): Promise<VectorDbStorageResponse> => {
  const ports = [...storagePorts];
  if (ports.length === 0) {
    return Promise.reject(new Error("The vector database has no main-thread storage bridge."));
  }
  return new Promise((resolve, reject) => {
    pendingStorageRequests.set(request.id, { resolve, reject });
    let sent = false;
    for (const port of ports) {
      try {
        if (request.type === "storage-write") {
          port.postMessage(request, [request.database.slice(0)]);
        } else {
          port.postMessage(request);
        }
        sent = true;
      } catch {
        storagePorts.delete(port);
      }
    }
    if (!sent) {
      pendingStorageRequests.delete(request.id);
      reject(new Error("Unable to reach storage bridge."));
    }
  });
};

const loadSnapshot = async (nextIndexId: string): Promise<Uint8Array | null> => {
  const response = await requestStorage({
    type: "storage-read",
    id: crypto.randomUUID(),
    indexId: nextIndexId,
  });
  if (!response.ok)
    throw new Error(response.error ?? "Unable to read the vector database snapshot.");
  return response.database ? new Uint8Array(response.database) : null;
};

const saveSnapshot = async (nextIndexId: string, databaseBytes: Uint8Array): Promise<boolean> => {
  const response = await requestStorage({
    type: "storage-write",
    id: crypto.randomUUID(),
    indexId: nextIndexId,
    database: databaseBytes.slice().buffer,
  });
  if (!response.ok) throw new Error(response.error ?? "Unable to persist the vector database.");
  return true;
};

const getDb = (): SqliteDatabase => {
  if (!db) throw new Error("The vector database has not been initialized.");
  return db;
};

const run = (sql: string, values: SqliteBindValue[] = []): void => {
  const statement = getDb().prepare(sql);
  try {
    values.forEach((value, index) => statement.bind(index + 1, value));
    statement.step();
  } finally {
    statement.finalize();
  }
};

const rows = <T extends Record<string, unknown>>(
  sql: string,
  values: SqliteBindValue[] = [],
): T[] => {
  const statement = getDb().prepare(sql);
  const result: T[] = [];
  try {
    values.forEach((value, index) => statement.bind(index + 1, value));
    while (statement.step()) result.push(statement.get({}) as T);
  } finally {
    statement.finalize();
  }
  return result;
};

const first = <T extends Record<string, unknown>>(
  sql: string,
  values: SqliteBindValue[] = [],
): T | null => rows<T>(sql, values)[0] ?? null;

const stringValue = (value: unknown): string => (typeof value === "string" ? value : "");
const numberValue = (value: unknown): number => (typeof value === "number" ? value : Number(value));
const optionalNumberValue = (value: unknown): number | undefined => {
  const parsed = numberValue(value);
  return value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : undefined;
};

const toVectorBuffer = (embedding: Float32Array): ArrayBuffer => {
  const copy = new Float32Array(embedding);
  return copy.buffer;
};

const getIndexMeta = (key: string): string | null => {
  const row = first<{ value: unknown }>("SELECT value FROM index_meta WHERE key = ?", [key]);
  return row ? stringValue(row.value) : null;
};

const setIndexMeta = (key: string, value: string): void => {
  run(
    "INSERT INTO index_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
};

const tokenize = (value: string): string[] => {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const segmenter =
    config?.segmenterLocale && typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(config.segmenterLocale, { granularity: "word" })
      : null;
  const segments = segmenter
    ? Array.from(segmenter.segment(normalized))
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment)
    : (normalized.match(/[\p{L}\p{N}\p{Script=Han}]+/gu) ?? []);
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
};

const compileFtsQuery = (query: string): string => {
  return filterSearchTerms(tokenize(query))
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" OR ");
};

const getScopeSql = (
  scope: VectorDbSearchRequest["scope"],
  column: string,
): { sql: string; values: SqliteBindValue[] } => {
  if (scope.kind === "all") return { sql: "", values: [] };
  if (scope.documentIds.length === 0) return { sql: " AND 0", values: [] };
  return {
    sql: ` AND ${column} IN (${scope.documentIds.map(() => "?").join(",")})`,
    values: scope.documentIds,
  };
};

const createSchema = (nextConfig: VectorDbIndexConfig): void => {
  run("PRAGMA journal_mode = WAL;");
  run("CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
  run(
    "CREATE TABLE IF NOT EXISTS indexed_documents (document_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, chunk_count INTEGER NOT NULL DEFAULT 0, token_count INTEGER NOT NULL DEFAULT 0, indexed_at INTEGER NOT NULL);",
  );
  run(
    "CREATE TABLE IF NOT EXISTS indexing_documents (document_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, expected_chunk_count INTEGER NOT NULL, indexed_at INTEGER NOT NULL);",
  );
  run(
    "CREATE TABLE IF NOT EXISTS chunks (chunk_rowid INTEGER PRIMARY KEY, chunk_id TEXT NOT NULL UNIQUE, document_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, content TEXT NOT NULL, chunk_content_hash TEXT NOT NULL, start_offset REAL, end_offset REAL, token_count INTEGER, heading_path TEXT, UNIQUE(document_id, chunk_index));",
  );
  const chunkColumns = rows<{ name: unknown }>("PRAGMA table_info(chunks)").map((row) =>
    stringValue(row.name),
  );
  if (!chunkColumns.includes("locator_json")) {
    run("ALTER TABLE chunks ADD COLUMN locator_json TEXT;");
  }
  run("CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);");
  run("CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON chunks(chunk_content_hash);");
  run(
    "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunk_id UNINDEXED, document_id UNINDEXED, search_text, heading_path, tokenize = 'unicode61');",
  );
  run(
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(chunk_rowid INTEGER PRIMARY KEY, document_id TEXT, embedding float[${nextConfig.dimensions}] distance_metric=cosine);`,
  );
};

const makeHealth = (): VectorDbIndexHealth => {
  const currentConfig = config;
  const currentIndexId = indexId;
  const currentSqlite = sqlite;
  if (!currentConfig || !currentIndexId || !currentSqlite) {
    throw new Error("The vector database is not ready.");
  }
  const documentCount = numberValue(
    first<{ count: unknown }>("SELECT count(*) AS count FROM indexed_documents")?.count,
  );
  const chunkCount = numberValue(
    first<{ count: unknown }>("SELECT count(*) AS count FROM chunks")?.count,
  );
  return {
    state: "ready",
    indexId: currentIndexId,
    config: currentConfig,
    sqliteVersion: currentSqlite.version.libVersion,
    sqliteVecVersion: getIndexMeta("sqlite_vec_version") ?? "unknown",
    documentCount,
    chunkCount,
    persistent,
  };
};

const restoreSnapshot = (database: SqliteDatabase, snapshot: Uint8Array): void => {
  if (!sqlite) throw new Error("The SQLite runtime is not ready.");
  const data = sqlite.wasm.allocFromTypedArray(snapshot);
  try {
    const result = sqlite.capi.sqlite3_deserialize(
      database.pointer,
      "main",
      data,
      BigInt(snapshot.byteLength),
      BigInt(snapshot.byteLength),
      1 | 2,
    );
    if (result !== 0) throw new Error(`Unable to restore the persisted index (SQLite ${result}).`);
  } catch (error) {
    sqlite.wasm.dealloc(data);
    throw error;
  }
};

const persistCurrentIndex = async (): Promise<void> => {
  if (!db || !indexId || !sqlite) return;
  const snapshot = sqlite.capi.sqlite3_js_db_export(db);
  persistent = await saveSnapshot(indexId, snapshot);
};

const initialize = async (nextConfig: VectorDbIndexConfig): Promise<VectorDbIndexHealth> => {
  const nextIndexId = await getVectorDbIndexId(nextConfig);
  if (db && indexId === nextIndexId) return makeHealth();
  if (db && indexId !== nextIndexId) {
    await persistCurrentIndex();
    db.close();
    db = null;
  }
  if (!sqlite) {
    const init = sqlite3InitModule as unknown as SqliteInit;
    sqlite = await init({
      locateFile: (path) => new URL(`/sqlite-vec/${path}`, self.location.origin).href,
    });
  }
  if (!db) {
    const snapshot = await loadSnapshot(nextIndexId);
    const opened = new sqlite.oo1.DB(":memory:");
    db = opened;
    persistent = false;
    if (snapshot) restoreSnapshot(opened, snapshot);
  }
  config = nextConfig;
  indexId = nextIndexId;
  createSchema(nextConfig);
  const storedConfig = getIndexMeta("config_json");
  const configJson = JSON.stringify(nextConfig);
  if (storedConfig && storedConfig !== configJson) {
    throw new Error("The persisted index configuration does not match this BGE configuration.");
  }
  setIndexMeta("index_id", nextIndexId);
  setIndexMeta("config_json", configJson);
  setIndexMeta("schema_version", "2");
  setIndexMeta("sqlite_version", sqlite.version.libVersion);
  setIndexMeta("sqlite_vec_version", getIndexMeta("sqlite_vec_version") ?? "0.1.6");
  setIndexMeta("last_opened_at", String(Date.now()));
  await persistCurrentIndex();
  return makeHealth();
};

const deleteDocumentRows = (documentId: string): void => {
  const oldChunks = rows<{ chunk_rowid: unknown }>(
    "SELECT chunk_rowid FROM chunks WHERE document_id = ?",
    [documentId],
  );
  const deleteVector = getDb().prepare("DELETE FROM vec_chunks WHERE chunk_rowid = ?");
  try {
    for (const chunk of oldChunks) {
      deleteVector.bind(1, numberValue(chunk.chunk_rowid)).stepReset();
    }
  } finally {
    deleteVector.finalize();
  }
  run("DELETE FROM chunks_fts WHERE document_id = ?", [documentId]);
  run("DELETE FROM chunks WHERE document_id = ?", [documentId]);
  run("DELETE FROM indexed_documents WHERE document_id = ?", [documentId]);
  run("DELETE FROM indexing_documents WHERE document_id = ?", [documentId]);
};

const checkDocuments = (documents: VectorDbDocumentFingerprint[]): VectorDbDocumentStatus[] => {
  return documents.map((document) => {
    const existing = first<{ content_hash: unknown; chunk_count: unknown }>(
      "SELECT content_hash, chunk_count FROM indexed_documents WHERE document_id = ?",
      [document.documentId],
    );
    const existingHash = existing ? stringValue(existing.content_hash) : null;
    const checkpoint = first<{ content_hash: unknown }>(
      "SELECT content_hash FROM indexing_documents WHERE document_id = ?",
      [document.documentId],
    );
    const checkpointMatches =
      checkpoint !== null && stringValue(checkpoint.content_hash) === document.contentHash;
    const checkpointedChunkCount = checkpointMatches
      ? numberValue(
          first<{ count: unknown }>("SELECT count(*) AS count FROM chunks WHERE document_id = ?", [
            document.documentId,
          ])?.count,
        )
      : 0;
    return {
      ...document,
      exists: existing !== null,
      matches: existingHash === document.contentHash,
      indexedChunkCount: existing ? numberValue(existing.chunk_count) : checkpointedChunkCount,
    };
  });
};

const validateDocumentPlan = (plan: VectorDbDocumentIndexPlan): void => {
  const chunkIds = new Set<string>();
  const chunkIndexes = new Set<number>();
  for (const chunk of plan.chunks) {
    if (chunkIds.has(chunk.chunkId)) {
      throw new Error(`Document ${plan.documentId} contains duplicate chunk ID ${chunk.chunkId}.`);
    }
    if (chunkIndexes.has(chunk.chunkIndex)) {
      throw new Error(
        `Document ${plan.documentId} contains duplicate chunk index ${chunk.chunkIndex}.`,
      );
    }
    chunkIds.add(chunk.chunkId);
    chunkIndexes.add(chunk.chunkIndex);
  }
};

interface StoredChunkFingerprint extends Record<string, unknown> {
  chunk_id: unknown;
  chunk_index: unknown;
  chunk_content_hash: unknown;
}

const getStoredChunkFingerprints = (documentId: string): StoredChunkFingerprint[] => {
  return rows<StoredChunkFingerprint>(
    "SELECT chunk_id, chunk_index, chunk_content_hash FROM chunks WHERE document_id = ? ORDER BY chunk_index",
    [documentId],
  );
};

const matchesPlannedChunk = (
  stored: StoredChunkFingerprint,
  planned: VectorDbChunkFingerprint | undefined,
): boolean => {
  return (
    planned !== undefined &&
    numberValue(stored.chunk_index) === planned.chunkIndex &&
    stringValue(stored.chunk_content_hash) === planned.contentHash
  );
};

const prepareDocument = (plan: VectorDbDocumentIndexPlan): VectorDbDocumentCheckpoint => {
  validateDocumentPlan(plan);
  const expectedChunkCount = plan.chunks.length;
  const completed = first<{ content_hash: unknown; chunk_count: unknown }>(
    "SELECT content_hash, chunk_count FROM indexed_documents WHERE document_id = ?",
    [plan.documentId],
  );
  if (
    completed &&
    stringValue(completed.content_hash) === plan.contentHash &&
    numberValue(completed.chunk_count) === expectedChunkCount
  ) {
    return {
      documentId: plan.documentId,
      contentHash: plan.contentHash,
      complete: true,
      expectedChunkCount,
      persistedChunkIds: [],
    };
  }

  const checkpoint = first<{ content_hash: unknown; expected_chunk_count: unknown }>(
    "SELECT content_hash, expected_chunk_count FROM indexing_documents WHERE document_id = ?",
    [plan.documentId],
  );
  let canResume =
    checkpoint !== null &&
    stringValue(checkpoint.content_hash) === plan.contentHash &&
    numberValue(checkpoint.expected_chunk_count) === expectedChunkCount;
  let storedChunks = canResume ? getStoredChunkFingerprints(plan.documentId) : [];
  if (canResume) {
    const plannedById = new Map(plan.chunks.map((chunk) => [chunk.chunkId, chunk]));
    canResume = storedChunks.every((stored) => {
      return matchesPlannedChunk(stored, plannedById.get(stringValue(stored.chunk_id)));
    });
  }

  if (!canResume) {
    run("BEGIN IMMEDIATE;");
    try {
      deleteDocumentRows(plan.documentId);
      run(
        "INSERT INTO indexing_documents(document_id, content_hash, expected_chunk_count, indexed_at) VALUES (?, ?, ?, ?)",
        [plan.documentId, plan.contentHash, expectedChunkCount, plan.indexedAt],
      );
      run("COMMIT;");
      storedChunks = [];
    } catch (error) {
      try {
        run("ROLLBACK;");
      } catch {
        // Preserve the original preparation error.
      }
      throw error;
    }
  }

  return {
    documentId: plan.documentId,
    contentHash: plan.contentHash,
    complete: false,
    expectedChunkCount,
    persistedChunkIds: storedChunks.map((chunk) => stringValue(chunk.chunk_id)),
  };
};

interface ExistingChunkRow extends Record<string, unknown> {
  chunk_rowid: unknown;
  chunk_id: unknown;
  document_id: unknown;
  chunk_index: unknown;
  chunk_content_hash: unknown;
}

const deleteChunkRow = (row: ExistingChunkRow): void => {
  const chunkRowid = numberValue(row.chunk_rowid);
  const chunkId = stringValue(row.chunk_id);
  const documentId = stringValue(row.document_id);
  run("DELETE FROM vec_chunks WHERE chunk_rowid = ?", [chunkRowid]);
  run("DELETE FROM chunks_fts WHERE chunk_id = ? AND document_id = ?", [chunkId, documentId]);
  run("DELETE FROM chunks WHERE chunk_rowid = ?", [chunkRowid]);
};

const insertChunk = (
  chunk: VectorDbIndexedChunk,
  insertChunkStatement: SqliteStatement,
  insertFtsStatement: SqliteStatement,
  insertVectorStatement: SqliteStatement,
): void => {
  insertChunkStatement
    .bind(1, chunk.chunkId)
    .bind(2, chunk.documentId)
    .bind(3, chunk.chunkIndex)
    .bind(4, chunk.content)
    .bind(5, chunk.contentHash)
    .bind(6, chunk.startOffset ?? null)
    .bind(7, chunk.endOffset ?? null)
    .bind(8, chunk.tokenCount ?? tokenize(chunk.content).length)
    .bind(9, JSON.stringify(chunk.headingPath ?? []))
    .bind(10, chunk.locator ? JSON.stringify(chunk.locator) : null)
    .stepReset();
  const row = first<{ chunk_rowid: unknown }>("SELECT last_insert_rowid() AS chunk_rowid");
  const chunkRowid = numberValue(row?.chunk_rowid);
  insertFtsStatement
    .bind(1, chunk.chunkId)
    .bind(2, chunk.documentId)
    .bind(3, tokenize(chunk.content).join(" "))
    .bind(4, JSON.stringify(chunk.headingPath ?? []))
    .stepReset();
  if (chunk.embedding) {
    insertVectorStatement
      .bind(1, chunkRowid)
      .bind(2, chunk.documentId)
      .bind(3, toVectorBuffer(chunk.embedding))
      .stepReset();
  }
};

const upsertChunkBatch = (
  batch: VectorDbChunkBatch,
): { documentId: string; persistedChunkCount: number } => {
  const checkpoint = first<{ content_hash: unknown }>(
    "SELECT content_hash FROM indexing_documents WHERE document_id = ?",
    [batch.documentId],
  );
  if (!checkpoint || stringValue(checkpoint.content_hash) !== batch.contentHash) {
    throw new Error(`Document ${batch.documentId} has no matching indexing checkpoint.`);
  }
  if (batch.chunks.some((chunk) => chunk.documentId !== batch.documentId)) {
    throw new Error(`Document ${batch.documentId} received a chunk for another document.`);
  }

  run("BEGIN IMMEDIATE;");
  try {
    const insertChunkStatement = getDb().prepare(
      "INSERT INTO chunks(chunk_id, document_id, chunk_index, content, chunk_content_hash, start_offset, end_offset, token_count, heading_path, locator_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertFtsStatement = getDb().prepare(
      "INSERT INTO chunks_fts(chunk_id, document_id, search_text, heading_path) VALUES (?, ?, ?, ?)",
    );
    const insertVectorStatement = getDb().prepare(
      "INSERT INTO vec_chunks(chunk_rowid, document_id, embedding) VALUES (?, ?, ?)",
    );
    try {
      for (const chunk of batch.chunks) {
        const conflicts = rows<ExistingChunkRow>(
          "SELECT chunk_rowid, chunk_id, document_id, chunk_index, chunk_content_hash FROM chunks WHERE chunk_id = ? OR (document_id = ? AND chunk_index = ?)",
          [chunk.chunkId, batch.documentId, chunk.chunkIndex],
        );
        const foreignConflict = conflicts.find(
          (row) => stringValue(row.document_id) !== batch.documentId,
        );
        if (foreignConflict) {
          throw new Error(`Chunk ID ${chunk.chunkId} is already owned by another document.`);
        }
        const exact = conflicts.find((row) => {
          return (
            stringValue(row.chunk_id) === chunk.chunkId &&
            numberValue(row.chunk_index) === chunk.chunkIndex &&
            stringValue(row.chunk_content_hash) === chunk.contentHash
          );
        });
        if (exact) continue;
        conflicts.forEach(deleteChunkRow);
        insertChunk(chunk, insertChunkStatement, insertFtsStatement, insertVectorStatement);
      }
    } finally {
      insertChunkStatement.finalize();
      insertFtsStatement.finalize();
      insertVectorStatement.finalize();
    }
    run("COMMIT;");
  } catch (error) {
    try {
      run("ROLLBACK;");
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
  const persistedChunkCount = numberValue(
    first<{ count: unknown }>("SELECT count(*) AS count FROM chunks WHERE document_id = ?", [
      batch.documentId,
    ])?.count,
  );
  return { documentId: batch.documentId, persistedChunkCount };
};

const finalizeDocument = (
  plan: VectorDbDocumentIndexPlan,
): { documentId: string; chunkCount: number } => {
  validateDocumentPlan(plan);
  const checkpoint = first<{ content_hash: unknown; expected_chunk_count: unknown }>(
    "SELECT content_hash, expected_chunk_count FROM indexing_documents WHERE document_id = ?",
    [plan.documentId],
  );
  if (
    !checkpoint ||
    stringValue(checkpoint.content_hash) !== plan.contentHash ||
    numberValue(checkpoint.expected_chunk_count) !== plan.chunks.length
  ) {
    throw new Error(`Document ${plan.documentId} has no matching indexing checkpoint.`);
  }

  const plannedById = new Map(plan.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const storedChunks = getStoredChunkFingerprints(plan.documentId);
  const allChunksMatch =
    storedChunks.length === plan.chunks.length &&
    storedChunks.every((stored) => {
      return matchesPlannedChunk(stored, plannedById.get(stringValue(stored.chunk_id)));
    });
  if (!allChunksMatch) {
    throw new Error(
      `Document ${plan.documentId} has ${storedChunks.length} of ${plan.chunks.length} persisted chunks.`,
    );
  }

  const tokenCount = numberValue(
    first<{ token_count: unknown }>(
      "SELECT coalesce(sum(token_count), 0) AS token_count FROM chunks WHERE document_id = ?",
      [plan.documentId],
    )?.token_count,
  );
  run("BEGIN IMMEDIATE;");
  try {
    run(
      "INSERT INTO indexed_documents(document_id, content_hash, chunk_count, token_count, indexed_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET content_hash = excluded.content_hash, chunk_count = excluded.chunk_count, token_count = excluded.token_count, indexed_at = excluded.indexed_at",
      [plan.documentId, plan.contentHash, plan.chunks.length, tokenCount, plan.indexedAt],
    );
    run("DELETE FROM indexing_documents WHERE document_id = ?", [plan.documentId]);
    run("COMMIT;");
  } catch (error) {
    try {
      run("ROLLBACK;");
    } catch {
      // Preserve the original finalization error.
    }
    throw error;
  }
  return { documentId: plan.documentId, chunkCount: plan.chunks.length };
};

const upsertDocument = (
  document: VectorDbIndexedDocument,
): { documentId: string; chunkCount: number } => {
  const plan: VectorDbDocumentIndexPlan = {
    documentId: document.documentId,
    contentHash: document.contentHash,
    indexedAt: document.indexedAt,
    chunks: document.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      contentHash: chunk.contentHash,
    })),
  };
  const checkpoint = prepareDocument(plan);
  if (checkpoint.complete) {
    return { documentId: document.documentId, chunkCount: document.chunks.length };
  }
  upsertChunkBatch({
    documentId: document.documentId,
    contentHash: document.contentHash,
    chunks: document.chunks,
  });
  return finalizeDocument(plan);
};

const deleteDocument = (documentId: string): { documentId: string } => {
  deleteDocumentRows(documentId);
  return { documentId };
};

interface LexicalRow extends Record<string, unknown> {
  chunk_rowid: unknown;
  chunk_id: unknown;
  document_id: unknown;
  chunk_index: unknown;
  content: unknown;
  heading_path: unknown;
  start_offset: unknown;
  end_offset: unknown;
  rank: unknown;
  locator_json: unknown;
}

interface SemanticRow extends Record<string, unknown> {
  chunk_rowid: unknown;
  distance: unknown;
}

interface ChunkRow extends Record<string, unknown> {
  chunk_rowid: unknown;
  chunk_id: unknown;
  document_id: unknown;
  chunk_index: unknown;
  content: unknown;
  heading_path: unknown;
  start_offset: unknown;
  end_offset: unknown;
  locator_json: unknown;
}

const parseHeadingPath = (value: unknown): string[] => {
  try {
    const parsed = JSON.parse(stringValue(value)) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const parseLocator = (value: unknown): ContentLocator | undefined => {
  try {
    const parsed = JSON.parse(stringValue(value)) as ContentLocator;
    return parsed && typeof parsed.kind === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const inspectIndex = (documentId?: string): VectorDbIndexInspection => {
  const documents = rows<Record<string, unknown>>(
    "SELECT document_id, content_hash, chunk_count, token_count, indexed_at FROM indexed_documents ORDER BY indexed_at DESC, document_id",
  ).map((row): VectorDbIndexedDocumentSummary => ({
    documentId: stringValue(row.document_id),
    contentHash: stringValue(row.content_hash),
    chunkCount: numberValue(row.chunk_count),
    tokenCount: numberValue(row.token_count),
    indexedAt: numberValue(row.indexed_at),
  }));
  const chunkRows = documentId
    ? rows<Record<string, unknown>>(
        "SELECT chunk_id, document_id, chunk_index, content, chunk_content_hash, start_offset, end_offset, token_count, heading_path, locator_json FROM chunks WHERE document_id = ? ORDER BY chunk_index",
        [documentId],
      )
    : [];
  const chunks = chunkRows.map((row): VectorDbIndexedChunkSummary => ({
    chunkId: stringValue(row.chunk_id),
    documentId: stringValue(row.document_id),
    chunkIndex: numberValue(row.chunk_index),
    content: stringValue(row.content),
    contentHash: stringValue(row.chunk_content_hash),
    startOffset: optionalNumberValue(row.start_offset),
    endOffset: optionalNumberValue(row.end_offset),
    tokenCount: optionalNumberValue(row.token_count),
    headingPath: parseHeadingPath(row.heading_path),
    locator: parseLocator(row.locator_json),
  }));
  return { health: makeHealth(), documents, chunks };
};

const search = (request: VectorDbSearchRequest): VectorDbSearchHit[] => {
  const topK = Math.max(1, Math.floor(request.topK));
  const lexicalCandidateK = Math.max(topK * 5, Math.floor(request.lexicalCandidateK ?? 50));
  const semanticCandidateK = Math.max(topK * 5, Math.floor(request.semanticCandidateK ?? 50));
  const lexicalWeight = request.lexicalWeight ?? 1;
  const semanticWeight = request.semanticWeight ?? 1;
  const rrfK = normalizeRrfK(request.rrfK);
  const maxVectorDistance =
    typeof request.maxVectorDistance === "number" && Number.isFinite(request.maxVectorDistance)
      ? Math.max(0, request.maxVectorDistance)
      : null;
  const requestedDocumentIds =
    request.scope.kind === "documents" ? new Set(request.scope.documentIds) : null;
  const completedDocumentIds = rows<{ document_id: unknown }>(
    "SELECT document_id FROM indexed_documents",
  )
    .map((row) => stringValue(row.document_id))
    .filter((documentId) => requestedDocumentIds === null || requestedDocumentIds.has(documentId));
  if (completedDocumentIds.length === 0) return [];
  const completedScope = { kind: "documents", documentIds: completedDocumentIds } as const;
  const scopeForFts = getScopeSql(completedScope, "f.document_id");
  const scopeForVector = getScopeSql(completedScope, "v.document_id");
  const lexicalQuery = compileFtsQuery(request.query);
  const lexicalRows = lexicalQuery
    ? rows<LexicalRow>(
        `SELECT c.chunk_rowid, c.chunk_id, c.document_id, c.chunk_index, c.content, c.heading_path, c.locator_json, c.start_offset, c.end_offset, f.rank AS rank FROM chunks_fts AS f JOIN chunks AS c ON c.chunk_id = f.chunk_id WHERE chunks_fts MATCH ?${scopeForFts.sql} ORDER BY f.rank LIMIT ?`,
        [lexicalQuery, ...scopeForFts.values, lexicalCandidateK],
      )
    : [];
  const semanticRows = request.queryEmbedding
    ? rows<SemanticRow>(
        `SELECT v.chunk_rowid, v.distance FROM vec_chunks AS v WHERE v.embedding MATCH ?${scopeForVector.sql} ORDER BY v.distance LIMIT ?`,
        [toVectorBuffer(request.queryEmbedding), ...scopeForVector.values, semanticCandidateK],
      ).filter(
        (row) => maxVectorDistance === null || numberValue(row.distance) <= maxVectorDistance,
      )
    : [];

  const byRowid = new Map<number, VectorDbSearchHit>();
  lexicalRows.forEach((row, index) => {
    const rowid = numberValue(row.chunk_rowid);
    byRowid.set(rowid, {
      chunkId: stringValue(row.chunk_id),
      documentId: stringValue(row.document_id),
      chunkIndex: numberValue(row.chunk_index),
      content: stringValue(row.content),
      headingPath: parseHeadingPath(row.heading_path),
      locator: parseLocator(row.locator_json),
      startOffset: optionalNumberValue(row.start_offset),
      endOffset: optionalNumberValue(row.end_offset),
      score: getRrfContribution(index + 1, lexicalWeight, rrfK),
      lexicalRank: index + 1,
      bm25Score: -numberValue(row.rank),
    });
  });
  const semanticRowIds = semanticRows.map((row) => numberValue(row.chunk_rowid));
  if (semanticRowIds.length) {
    const placeholders = semanticRowIds.map(() => "?").join(",");
    const chunkRows = rows<ChunkRow>(
      `SELECT chunk_rowid, chunk_id, document_id, chunk_index, content, heading_path, locator_json, start_offset, end_offset FROM chunks WHERE chunk_rowid IN (${placeholders})`,
      semanticRowIds,
    );
    const chunksByRowid = new Map(chunkRows.map((row) => [numberValue(row.chunk_rowid), row]));
    semanticRows.forEach((row, index) => {
      const rowid = numberValue(row.chunk_rowid);
      const chunk = chunksByRowid.get(rowid);
      if (!chunk) return;
      const current = byRowid.get(rowid);
      const semanticScore = getRrfContribution(index + 1, semanticWeight, rrfK);
      byRowid.set(rowid, {
        chunkId: stringValue(chunk.chunk_id),
        documentId: stringValue(chunk.document_id),
        chunkIndex: numberValue(chunk.chunk_index),
        content: stringValue(chunk.content),
        headingPath: parseHeadingPath(chunk.heading_path),
        locator: parseLocator(chunk.locator_json),
        startOffset: optionalNumberValue(chunk.start_offset),
        endOffset: optionalNumberValue(chunk.end_offset),
        score: (current?.score ?? 0) + semanticScore,
        lexicalRank: current?.lexicalRank,
        semanticRank: index + 1,
        bm25Score: current?.bm25Score,
        vectorDistance: numberValue(row.distance),
      });
    });
  }
  const rankedHits = [...byRowid.values()];
  const relevantHits =
    request.queryEmbedding && maxVectorDistance !== null
      ? rankedHits.filter(
          (hit) => hit.vectorDistance !== undefined && hit.vectorDistance <= maxVectorDistance,
        )
      : rankedHits;
  return relevantHits
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.documentId.localeCompare(right.documentId) ||
        left.chunkIndex - right.chunkIndex,
    )
    .slice(0, topK);
};

const reset = (): VectorDbIndexHealth => {
  run("BEGIN IMMEDIATE;");
  try {
    run("DELETE FROM vec_chunks;");
    run("DELETE FROM chunks_fts;");
    run("DELETE FROM chunks;");
    run("DELETE FROM indexed_documents;");
    run("DELETE FROM indexing_documents;");
    run("COMMIT;");
  } catch (error) {
    try {
      run("ROLLBACK;");
    } catch {
      // Preserve the original reset error.
    }
    throw error;
  }
  return makeHealth();
};

export const handleVectorDbRequest = async (request: VectorDbWorkerRequest): Promise<unknown> => {
  if (request.indexConfig && request.type !== "initialize") {
    await initialize(request.indexConfig);
  }
  switch (request.type) {
    case "initialize":
      return initialize((request.payload as { config: VectorDbIndexConfig }).config);
    case "health":
      return makeHealth();
    case "inspect":
      return inspectIndex((request.payload as { documentId?: string }).documentId);
    case "checkDocuments":
      return checkDocuments(
        (request.payload as { documents: VectorDbDocumentFingerprint[] }).documents,
      );
    case "prepareDocument":
      return prepareDocument((request.payload as { plan: VectorDbDocumentIndexPlan }).plan);
    case "upsertChunkBatch":
      return upsertChunkBatch((request.payload as { batch: VectorDbChunkBatch }).batch);
    case "finalizeDocument":
      return finalizeDocument((request.payload as { plan: VectorDbDocumentIndexPlan }).plan);
    case "upsert":
      return upsertDocument((request.payload as { document: VectorDbIndexedDocument }).document);
    case "deleteDocument":
      return deleteDocument((request.payload as { documentId: string }).documentId);
    case "search":
      return search((request.payload as { request: VectorDbSearchRequest }).request);
    case "reset":
      return reset();
    case "close":
      db?.close();
      db = null;
      return { closed: true };
  }
};

interface SharedWorkerConnectEvent {
  ports: MessagePort[];
}

const MUTATING_REQUEST_TYPES = new Set<VectorDbWorkerRequest["type"]>([
  "initialize",
  "prepareDocument",
  "upsertChunkBatch",
  "finalizeDocument",
  "upsert",
  "deleteDocument",
  "reset",
]);

let requestQueue = Promise.resolve();

const processRequest = (request: VectorDbWorkerRequest): Promise<unknown> => {
  const next = requestQueue.then(async () => {
    if (request.type === "close") await persistCurrentIndex();
    const payload = await handleVectorDbRequest(request);
    if (MUTATING_REQUEST_TYPES.has(request.type)) await persistCurrentIndex();
    return payload;
  });
  requestQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

const respondToRequest = (port: MessagePort, request: VectorDbWorkerRequest): void => {
  void processRequest(request)
    .then((payload) => {
      port.postMessage({
        id: request.id,
        ok: true,
        type: request.type,
        payload,
      } satisfies VectorDbWorkerResponse);
    })
    .catch((error: unknown) => {
      port.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "Vector database operation failed.",
      } satisfies VectorDbWorkerResponse);
    });
};

const sharedWorkerScope = self as unknown as {
  addEventListener(type: "connect", listener: (event: SharedWorkerConnectEvent) => void): void;
};

sharedWorkerScope.addEventListener("connect", (event) => {
  const port = event.ports[0];
  if (!port) return;
  port.addEventListener(
    "message",
    (message: MessageEvent<VectorDbWorkerRequest | VectorDbStorageResponse>) => {
      if ("ok" in message.data) {
        const pending = pendingStorageRequests.get(message.data.id);
        if (!pending) return;
        pendingStorageRequests.delete(message.data.id);
        if (message.data.ok) pending.resolve(message.data);
        else pending.reject(new Error(message.data.error));
        return;
      }
      storagePorts.add(port);
      respondToRequest(port, message.data as VectorDbWorkerRequest);
    },
  );
  port.start();
});
