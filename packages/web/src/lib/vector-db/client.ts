import { file as opfsFile, write as opfsWrite } from "@memora/fs";

export interface VectorDbIndexConfig {
  model: string;
  modelRevision: string;
  dimensions: number;
  metric: "cosine";
  normalized: boolean;
  pooling: string;
  queryPrefix: string;
  documentPrefix: string;
  chunkerName: string;
  chunkerVersion: string;
  chunkSize: number;
  chunkOverlap: number;
  segmenterLocale: string;
  segmenterPipelineVersion: string;
}

export interface VectorDbIndexedChunk {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  startOffset?: number;
  endOffset?: number;
  tokenCount?: number;
  headingPath?: string[];
  embedding: Float32Array;
}

export interface VectorDbIndexedDocument {
  documentId: string;
  contentHash: string;
  chunks: VectorDbIndexedChunk[];
  indexedAt: number;
}

export interface VectorDbDocumentFingerprint {
  documentId: string;
  contentHash: string;
}

export interface VectorDbDocumentStatus extends VectorDbDocumentFingerprint {
  exists: boolean;
  matches: boolean;
  indexedChunkCount: number;
}

export interface VectorDbChunkFingerprint {
  chunkId: string;
  chunkIndex: number;
  contentHash: string;
}

export interface VectorDbDocumentIndexPlan extends VectorDbDocumentFingerprint {
  indexedAt: number;
  chunks: VectorDbChunkFingerprint[];
}

export interface VectorDbDocumentCheckpoint extends VectorDbDocumentFingerprint {
  complete: boolean;
  expectedChunkCount: number;
  persistedChunkIds: string[];
}

export interface VectorDbChunkBatch extends VectorDbDocumentFingerprint {
  chunks: VectorDbIndexedChunk[];
}

export type VectorDbSearchScope = { kind: "all" } | { kind: "documents"; documentIds: string[] };

export interface VectorDbSearchRequest {
  query: string;
  queryEmbedding?: Float32Array;
  scope: VectorDbSearchScope;
  topK: number;
  lexicalCandidateK?: number;
  semanticCandidateK?: number;
  lexicalWeight?: number;
  semanticWeight?: number;
  rrfK?: number;
  maxVectorDistance?: number;
}

export interface VectorDbSearchHit {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  headingPath: string[];
  startOffset?: number;
  endOffset?: number;
  score: number;
  lexicalRank?: number;
  semanticRank?: number;
  bm25Score?: number;
  vectorDistance?: number;
}

export interface VectorDbIndexHealth {
  state: "ready" | "failed";
  indexId: string;
  config: VectorDbIndexConfig;
  sqliteVersion: string;
  sqliteVecVersion: string;
  documentCount: number;
  chunkCount: number;
  persistent: boolean;
}

export interface VectorDbIndexedDocumentSummary {
  documentId: string;
  contentHash: string;
  chunkCount: number;
  tokenCount: number;
  indexedAt: number;
}

export interface VectorDbIndexedChunkSummary {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  startOffset?: number;
  endOffset?: number;
  tokenCount?: number;
  headingPath: string[];
}

export interface VectorDbIndexInspection {
  health: VectorDbIndexHealth;
  documents: VectorDbIndexedDocumentSummary[];
  chunks: VectorDbIndexedChunkSummary[];
}

interface IndexWorkerRequestMap {
  initialize: { config: VectorDbIndexConfig };
  health: undefined;
  inspect: { documentId?: string };
  checkDocuments: { documents: VectorDbDocumentFingerprint[] };
  prepareDocument: { plan: VectorDbDocumentIndexPlan };
  upsertChunkBatch: { batch: VectorDbChunkBatch };
  finalizeDocument: { plan: VectorDbDocumentIndexPlan };
  upsert: { document: VectorDbIndexedDocument };
  search: { request: VectorDbSearchRequest };
  reset: undefined;
  close: undefined;
}

interface IndexWorkerResponseMap {
  initialize: VectorDbIndexHealth;
  health: VectorDbIndexHealth;
  inspect: VectorDbIndexInspection;
  checkDocuments: VectorDbDocumentStatus[];
  prepareDocument: VectorDbDocumentCheckpoint;
  upsertChunkBatch: { documentId: string; persistedChunkCount: number };
  finalizeDocument: { documentId: string; chunkCount: number };
  upsert: { documentId: string; chunkCount: number };
  search: VectorDbSearchHit[];
  reset: VectorDbIndexHealth;
  close: { closed: true };
}

type IndexWorkerRequest = {
  [K in keyof IndexWorkerRequestMap]: {
    id: string;
    type: K;
    payload: IndexWorkerRequestMap[K];
  };
}[keyof IndexWorkerRequestMap];

type IndexWorkerResponse =
  | {
      id: string;
      ok: true;
      type: keyof IndexWorkerResponseMap;
      payload: IndexWorkerResponseMap[keyof IndexWorkerResponseMap];
    }
  | { id: string; ok: false; error: string };

type VectorDbStorageRequest =
  | { type: "storage-read"; id: string; indexId: string }
  | { type: "storage-write"; id: string; indexId: string; database: ArrayBuffer };

type VectorDbStorageResponse =
  | { type: "storage-read-result"; id: string; ok: true; database?: ArrayBuffer }
  | { type: "storage-write-result"; id: string; ok: true }
  | { type: "storage-read-result" | "storage-write-result"; id: string; ok: false; error: string };

type IndexWorkerMessage = IndexWorkerResponse | VectorDbStorageRequest;

// Keep the legacy path so existing local indexes remain discoverable after the
// SharedWorker storage bridge takes over persistence.
const VECTOR_DB_SNAPSHOT_ROOT = "/search-indexes";

const getSnapshotPath = (indexId: string): string => {
  return `${VECTOR_DB_SNAPSHOT_ROOT}/${indexId}.sqlite3`;
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
};

const toHex = (bytes: Uint8Array): string => {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const getVectorDbIndexId = async (config: VectorDbIndexConfig): Promise<string> => {
  const encoded = new TextEncoder().encode(stableStringify(config));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest)).slice(0, 24);
};

export const getVectorDbContentHash = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
};

export class VectorDbClient {
  private worker: SharedWorker | null = null;
  private port: MessagePort | null = null;
  private mountCount = 0;
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  private async handleStorageRequest(
    port: MessagePort,
    request: Extract<VectorDbStorageRequest, { type: "storage-read" | "storage-write" }>,
  ): Promise<void> {
    try {
      const path = getSnapshotPath(request.indexId);
      if (request.type === "storage-read") {
        const exists = await opfsFile(path).exists();
        if (!exists) {
          port.postMessage({
            type: "storage-read-result",
            id: request.id,
            ok: true,
          } satisfies VectorDbStorageResponse);
          return;
        }
        const database = await opfsFile(path).arrayBuffer();
        port.postMessage(
          {
            type: "storage-read-result",
            id: request.id,
            ok: true,
            database,
          } satisfies VectorDbStorageResponse,
          [database],
        );
        return;
      }
      await opfsWrite(path, request.database, { overwrite: true });
      port.postMessage({
        type: "storage-write-result",
        id: request.id,
        ok: true,
      } satisfies VectorDbStorageResponse);
    } catch (error) {
      port.postMessage({
        type: request.type === "storage-read" ? "storage-read-result" : "storage-write-result",
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "Vector database storage failed.",
      } satisfies VectorDbStorageResponse);
    }
  }

  private getPort(): MessagePort {
    if (this.port) return this.port;
    const worker = new SharedWorker(
      new URL("../../workers/vector-db.shared-worker.ts", import.meta.url),
      {
        type: "module",
        name: "memora-vector-db",
        extendedLifetime: true,
      },
    );
    const port = worker.port;
    port.addEventListener("message", (event: MessageEvent<IndexWorkerMessage>) => {
      if (
        "type" in event.data &&
        (event.data.type === "storage-read" || event.data.type === "storage-write")
      ) {
        void this.handleStorageRequest(port, event.data as VectorDbStorageRequest);
        return;
      }
      if (!("ok" in event.data)) return;
      const request = this.pending.get(event.data.id);
      if (!request) return;
      this.pending.delete(event.data.id);
      if (event.data.ok) request.resolve(event.data.payload);
      else request.reject(new Error(event.data.error));
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "The local index worker stopped unexpectedly.");
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
      this.worker = null;
      this.port = null;
    });
    port.start();
    this.worker = worker;
    this.port = port;
    return port;
  }

  mount(): () => void {
    this.mountCount += 1;
    this.getPort();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.mountCount = Math.max(0, this.mountCount - 1);
      if (this.mountCount !== 0) return;
      queueMicrotask(() => {
        if (this.mountCount === 0) this.detach();
      });
    };
  }

  private detach(): void {
    const error = new Error("The local index worker was unmounted.");
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.port?.close();
    this.port = null;
    this.worker = null;
  }

  private call<T extends keyof IndexWorkerRequestMap>(
    type: T,
    payload: IndexWorkerRequestMap[T],
  ): Promise<IndexWorkerResponseMap[T]> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const request = { id, type, payload } as IndexWorkerRequest;
      this.getPort().postMessage(request);
    });
  }

  initialize(config: VectorDbIndexConfig): Promise<VectorDbIndexHealth> {
    return this.call("initialize", { config });
  }

  health(): Promise<VectorDbIndexHealth> {
    return this.call("health", undefined);
  }

  inspect(documentId?: string): Promise<VectorDbIndexInspection> {
    return this.call("inspect", { documentId });
  }

  checkDocuments(documents: VectorDbDocumentFingerprint[]): Promise<VectorDbDocumentStatus[]> {
    return this.call("checkDocuments", { documents });
  }

  prepareDocument(plan: VectorDbDocumentIndexPlan): Promise<VectorDbDocumentCheckpoint> {
    return this.call("prepareDocument", { plan });
  }

  upsertChunkBatch(
    batch: VectorDbChunkBatch,
  ): Promise<{ documentId: string; persistedChunkCount: number }> {
    return this.call("upsertChunkBatch", { batch });
  }

  finalizeDocument(
    plan: VectorDbDocumentIndexPlan,
  ): Promise<{ documentId: string; chunkCount: number }> {
    return this.call("finalizeDocument", { plan });
  }

  upsertDocument(
    document: VectorDbIndexedDocument,
  ): Promise<{ documentId: string; chunkCount: number }> {
    return this.call("upsert", { document });
  }

  search(request: VectorDbSearchRequest): Promise<VectorDbSearchHit[]> {
    return this.call("search", { request });
  }

  reset(): Promise<VectorDbIndexHealth> {
    return this.call("reset", undefined);
  }

  async close(): Promise<void> {
    if (!this.worker) return;
    await this.call("close", undefined);
    this.detach();
  }
}

export const createVectorDbClient = (): VectorDbClient => {
  return new VectorDbClient();
};
