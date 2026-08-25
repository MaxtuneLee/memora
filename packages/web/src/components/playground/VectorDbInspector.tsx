import { Button } from "@base-ui/react/button";
import {
  ArrowClockwiseIcon,
  DatabaseIcon,
  FileTextIcon,
  HashIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { playgroundLocalIndex, type PlaygroundIndexInspection } from "@/lib/playground/localIndex";

const SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-memora-border bg-memora-surface px-4 text-sm font-medium text-memora-text transition-colors hover:bg-memora-surface-soft disabled:cursor-not-allowed disabled:opacity-45";

const formatDate = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
};

const shortenHash = (value: string): string => {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
};

const formatOffset = (value: number | undefined): string => {
  if (value === undefined) return "—";
  return `${value.toLocaleString()} ms`;
};

interface StatProps {
  label: string;
  value: string;
  detail?: string;
}

function Stat({ label, value, detail }: StatProps) {
  return (
    <div className="rounded-2xl border border-memora-border-soft bg-memora-canvas px-4 py-3">
      <p className="text-xs font-medium text-memora-text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
        {value}
      </p>
      {detail ? <p className="mt-0.5 text-xs text-memora-text-soft">{detail}</p> : null}
    </div>
  );
}

function EmptyInspector({
  isLoading,
  error,
  onRefresh,
}: {
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-[24px] border border-dashed border-memora-border-soft bg-memora-surface-soft px-6 py-14 text-center">
      <div className="max-w-md">
        <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-memora-surface-muted text-memora-text-muted">
          {isLoading ? (
            <SpinnerGapIcon className="size-5 animate-spin" />
          ) : (
            <DatabaseIcon className="size-5" />
          )}
        </span>
        <h2 className="mt-5 font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
          {isLoading ? "Reading the local index" : "No index is open"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-memora-text-muted">
          {error
            ? "Run semantic retrieval in the Grounded AI tab first, then refresh this inspector to read the same local SQLite database."
            : "The inspector will show documents and passages after the local vector index has been initialized."}
        </p>
        {error ? (
          <p className="mt-3 rounded-xl bg-memora-warning-surface px-3 py-2 text-left text-xs leading-5 text-memora-warning-text">
            {error}
          </p>
        ) : null}
        <Button
          onClick={onRefresh}
          disabled={isLoading}
          className={`${SECONDARY_BUTTON_CLASS_NAME} mx-auto mt-5`}
        >
          <ArrowClockwiseIcon className="size-4" />
          Refresh index
        </Button>
      </div>
    </div>
  );
}

export default function VectorDbInspector() {
  const [inspection, setInspection] = useState<PlaygroundIndexInspection | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (documentId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const nextInspection = await playgroundLocalIndex.inspect(documentId);
      setInspection(nextInspection);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read the local index.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedDocument = useMemo(
    () => inspection?.documents.find((document) => document.documentId === selectedDocumentId),
    [inspection, selectedDocumentId],
  );

  const selectDocument = useCallback(
    (documentId: string) => {
      setSelectedDocumentId(documentId);
      void refresh(documentId);
    },
    [refresh],
  );

  if (!inspection) {
    return <EmptyInspector isLoading={isLoading} error={error} onRefresh={() => void refresh()} />;
  }

  const { health, documents, chunks } = inspection;

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-memora-border bg-memora-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-memora-olive-faint text-memora-olive">
              <DatabaseIcon className="size-4" />
            </span>
            <div>
              <h2 className="font-serif text-xl font-medium tracking-tight text-memora-text-strong">
                Vector database inspector
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-memora-text-muted">
                A read-only view of the documents and passages currently stored in the local
                sqlite-vec index.
              </p>
            </div>
          </div>
          <Button
            onClick={() => void refresh(selectedDocumentId ?? undefined)}
            disabled={isLoading}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <ArrowClockwiseIcon className={isLoading ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Indexed documents" value={health.documentCount.toLocaleString()} />
          <Stat label="Stored chunks" value={health.chunkCount.toLocaleString()} />
          <Stat
            label="Embedding model"
            value={health.config.model === "bge-m3" ? "BGE-M3" : "BGE small EN"}
            detail={`${health.config.dimensions} dimensions · ${health.config.metric}`}
          />
          <Stat
            label="Storage"
            value={health.persistent ? "OPFS" : "SQLite"}
            detail={`sqlite-vec ${health.sqliteVecVersion}`}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-memora-border pt-4 text-xs text-memora-text-soft">
          <span className="font-mono">index {health.indexId}</span>
          <span>SQLite {health.sqliteVersion}</span>
          <span>chunk size {health.config.chunkSize.toLocaleString()} chars</span>
          <span>{health.config.pooling} pooling</span>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.65fr)_minmax(0,1.35fr)]">
        <section className="min-w-0 rounded-[26px] border border-memora-border bg-memora-surface p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3 border-b border-memora-border pb-4">
            <div>
              <h2 className="font-serif text-xl font-medium tracking-tight text-memora-text-strong">
                Indexed documents
              </h2>
              <p className="mt-1 text-sm text-memora-text-muted">
                Select a document to inspect its stored passages.
              </p>
            </div>
            <span className="text-xs text-memora-text-soft">{documents.length}</span>
          </div>

          {documents.length ? (
            <div className="mt-4 space-y-2">
              {documents.map((document) => {
                const isSelected = document.documentId === selectedDocumentId;
                return (
                  <button
                    key={document.documentId}
                    type="button"
                    onClick={() => selectDocument(document.documentId)}
                    className={`w-full rounded-2xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft ${isSelected ? "border-memora-olive-soft bg-memora-olive-faint/35" : "border-memora-border-soft bg-memora-canvas hover:bg-memora-surface-soft"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-memora-text">
                        {document.documentId}
                      </span>
                      <span className="shrink-0 rounded-full bg-memora-surface-muted px-2 py-0.5 text-xs text-memora-text-muted">
                        {document.chunkCount} chunks
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-memora-text-soft">
                      <span className="font-mono">{shortenHash(document.contentHash)}</span>
                      <span>·</span>
                      <span>{formatDate(document.indexedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-sm text-memora-text-muted">
              The index has no completed documents.
            </p>
          )}
        </section>

        <section className="min-w-0 rounded-[26px] border border-memora-border bg-memora-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-memora-border pb-4">
            <div className="min-w-0">
              <h2 className="font-serif text-xl font-medium tracking-tight text-memora-text-strong">
                {selectedDocument ? selectedDocument.documentId : "Stored passages"}
              </h2>
              <p className="mt-1 text-sm text-memora-text-muted">
                {selectedDocument
                  ? `${chunks.length} of ${selectedDocument.chunkCount} chunks · ${selectedDocument.tokenCount.toLocaleString()} tokens`
                  : "Choose a document on the left to see what was embedded."}
              </p>
            </div>
            {selectedDocument ? (
              <span className="rounded-full border border-memora-border bg-memora-surface-soft px-2.5 py-1 text-xs text-memora-text-muted">
                {formatDate(selectedDocument.indexedAt)}
              </span>
            ) : null}
          </div>

          {chunks.length ? (
            <div className="mt-4 space-y-3">
              {chunks.map((chunk) => (
                <article
                  key={chunk.chunkId}
                  className="rounded-2xl border border-memora-border-soft bg-memora-canvas px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-memora-text-soft">
                    <span className="inline-flex items-center gap-1 font-medium text-memora-text-muted">
                      <HashIcon className="size-3.5" />
                      {chunk.chunkIndex + 1}
                    </span>
                    <span>{chunk.tokenCount ?? 0} tokens</span>
                    {chunk.headingPath.length ? <span>{chunk.headingPath.join(" / ")}</span> : null}
                    {chunk.startOffset !== undefined || chunk.endOffset !== undefined ? (
                      <span>
                        {formatOffset(chunk.startOffset)} – {formatOffset(chunk.endOffset)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap text-sm leading-6 text-memora-text">
                    {chunk.content}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-memora-text-soft">
                    <FileTextIcon className="size-3.5" />
                    <span className="font-mono">{shortenHash(chunk.chunkId)}</span>
                    <span>·</span>
                    <span className="font-mono">content {shortenHash(chunk.contentHash)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
              <p className="max-w-sm text-sm leading-6 text-memora-text-muted">
                Select a document to inspect the exact text passages that were written alongside
                their vectors.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
