export type PlaygroundIndexModel = "bge-small-en" | "bge-m3";

export interface PlaygroundIndexConfig {
  model: PlaygroundIndexModel;
  modelRevision: string;
  dimensions: number;
  metric: "cosine";
  normalized: true;
  pooling: "mean" | "cls";
  queryPrefix: string;
  documentPrefix: string;
  chunkerName: "transcript-characters";
  chunkerVersion: "1";
  chunkSize: number;
  chunkOverlap: number;
  segmenterLocale: string;
  segmenterPipelineVersion: "1";
}

export interface PlaygroundIndexedChunk {
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

export interface PlaygroundIndexedDocument {
  documentId: string;
  contentHash: string;
  chunks: PlaygroundIndexedChunk[];
  indexedAt: number;
}

export interface PlaygroundDocumentFingerprint {
  documentId: string;
  contentHash: string;
}

export interface PlaygroundDocumentStatus extends PlaygroundDocumentFingerprint {
  exists: boolean;
  matches: boolean;
  indexedChunkCount: number;
}

export interface PlaygroundChunkFingerprint {
  chunkId: string;
  chunkIndex: number;
  contentHash: string;
}

export interface PlaygroundDocumentIndexPlan extends PlaygroundDocumentFingerprint {
  indexedAt: number;
  chunks: PlaygroundChunkFingerprint[];
}

export interface PlaygroundDocumentCheckpoint extends PlaygroundDocumentFingerprint {
  complete: boolean;
  expectedChunkCount: number;
  persistedChunkIds: string[];
}

export interface PlaygroundChunkBatch extends PlaygroundDocumentFingerprint {
  chunks: PlaygroundIndexedChunk[];
}

export type PlaygroundSearchScope = { kind: "all" } | { kind: "documents"; documentIds: string[] };

export interface PlaygroundSearchRequest {
  query: string;
  queryEmbedding?: Float32Array;
  scope: PlaygroundSearchScope;
  topK: number;
  lexicalCandidateK?: number;
  semanticCandidateK?: number;
  lexicalWeight?: number;
  semanticWeight?: number;
  rrfK?: number;
  maxVectorDistance?: number;
}

export interface PlaygroundSearchHit {
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

export interface PlaygroundIndexHealth {
  state: "ready" | "failed";
  indexId: string;
  config: PlaygroundIndexConfig;
  sqliteVersion: string;
  sqliteVecVersion: string;
  documentCount: number;
  chunkCount: number;
  persistent: boolean;
}

export interface PlaygroundIndexedDocumentSummary {
  documentId: string;
  contentHash: string;
  chunkCount: number;
  tokenCount: number;
  indexedAt: number;
}

export interface PlaygroundIndexedChunkSummary {
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

export interface PlaygroundIndexInspection {
  health: PlaygroundIndexHealth;
  documents: PlaygroundIndexedDocumentSummary[];
  chunks: PlaygroundIndexedChunkSummary[];
}

interface IndexWorkerRequestMap {
  initialize: { config: PlaygroundIndexConfig };
  health: undefined;
  inspect: { documentId?: string };
  checkDocuments: { documents: PlaygroundDocumentFingerprint[] };
  prepareDocument: { plan: PlaygroundDocumentIndexPlan };
  upsertChunkBatch: { batch: PlaygroundChunkBatch };
  finalizeDocument: { plan: PlaygroundDocumentIndexPlan };
  upsert: { document: PlaygroundIndexedDocument };
  search: { request: PlaygroundSearchRequest };
  reset: undefined;
  close: undefined;
}

interface IndexWorkerResponseMap {
  initialize: PlaygroundIndexHealth;
  health: PlaygroundIndexHealth;
  inspect: PlaygroundIndexInspection;
  checkDocuments: PlaygroundDocumentStatus[];
  prepareDocument: PlaygroundDocumentCheckpoint;
  upsertChunkBatch: { documentId: string; persistedChunkCount: number };
  finalizeDocument: { documentId: string; chunkCount: number };
  upsert: { documentId: string; chunkCount: number };
  search: PlaygroundSearchHit[];
  reset: PlaygroundIndexHealth;
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

export const getPlaygroundIndexId = async (config: PlaygroundIndexConfig): Promise<string> => {
  const encoded = new TextEncoder().encode(stableStringify(config));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest)).slice(0, 24);
};

export const getPlaygroundContentHash = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
};

export class PlaygroundLocalIndex {
  private worker: Worker | null = null;
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(
      new URL("../../workers/playground-index-owner.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    worker.addEventListener("message", (event: MessageEvent<IndexWorkerResponse>) => {
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
    });
    this.worker = worker;
    return worker;
  }

  private call<T extends keyof IndexWorkerRequestMap>(
    type: T,
    payload: IndexWorkerRequestMap[T],
  ): Promise<IndexWorkerResponseMap[T]> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const request = { id, type, payload } as IndexWorkerRequest;
      this.getWorker().postMessage(request);
    });
  }

  initialize(config: PlaygroundIndexConfig): Promise<PlaygroundIndexHealth> {
    return this.call("initialize", { config });
  }

  health(): Promise<PlaygroundIndexHealth> {
    return this.call("health", undefined);
  }

  inspect(documentId?: string): Promise<PlaygroundIndexInspection> {
    return this.call("inspect", { documentId });
  }

  checkDocuments(documents: PlaygroundDocumentFingerprint[]): Promise<PlaygroundDocumentStatus[]> {
    return this.call("checkDocuments", { documents });
  }

  prepareDocument(plan: PlaygroundDocumentIndexPlan): Promise<PlaygroundDocumentCheckpoint> {
    return this.call("prepareDocument", { plan });
  }

  upsertChunkBatch(
    batch: PlaygroundChunkBatch,
  ): Promise<{ documentId: string; persistedChunkCount: number }> {
    return this.call("upsertChunkBatch", { batch });
  }

  finalizeDocument(
    plan: PlaygroundDocumentIndexPlan,
  ): Promise<{ documentId: string; chunkCount: number }> {
    return this.call("finalizeDocument", { plan });
  }

  upsertDocument(
    document: PlaygroundIndexedDocument,
  ): Promise<{ documentId: string; chunkCount: number }> {
    return this.call("upsert", { document });
  }

  search(request: PlaygroundSearchRequest): Promise<PlaygroundSearchHit[]> {
    return this.call("search", { request });
  }

  reset(): Promise<PlaygroundIndexHealth> {
    return this.call("reset", undefined);
  }

  async close(): Promise<void> {
    if (!this.worker) return;
    await this.call("close", undefined);
    this.worker.terminate();
    this.worker = null;
  }
}

export const playgroundLocalIndex = new PlaygroundLocalIndex();
