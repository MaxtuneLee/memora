import { Button } from "@base-ui/react/button";
import {
  ArrowClockwiseIcon,
  DatabaseIcon,
  FileTextIcon,
  HashIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { VectorDbIndexInspection } from "@/lib/vector-db";
import { modelWorkerFactory } from "@/lib/model-worker";
import { LEXICAL_INDEX_CONFIG } from "@/lib/search/searchIndexConfig";
import { tokens } from "../../styles/stylex.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
  secondaryButton: {
    alignItems: "center",
    backgroundColor: {
      default: tokens.surface,
      ":hover": tokens.surfaceSoft,
    },
    borderColor: tokens.border,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    height: "2.5rem",
    justifyContent: "center",
    lineHeight: "1.25rem",
    paddingInline: "1rem",
    transition: "background-color 150ms",
    ":disabled": { cursor: "not-allowed", opacity: 0.45 },
  },
  centeredButton: { marginInline: "auto", marginTop: "1.25rem" },
  icon: { height: "1rem", width: "1rem" },
  spin: { animation: `${spin} 1s linear infinite` },
  stat: {
    backgroundColor: tokens.canvas,
    borderColor: tokens.borderSoft,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  statLabel: {
    color: tokens.textMuted,
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "1rem",
  },
  statValue: {
    color: tokens.textStrong,
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.5rem",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: "2rem",
    marginTop: "0.25rem",
  },
  statDetail: {
    color: tokens.textSoft,
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.125rem",
  },
  empty: {
    alignItems: "center",
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.borderSoft,
    borderRadius: "24px",
    borderStyle: "dashed",
    borderWidth: 1,
    display: "flex",
    justifyContent: "center",
    minHeight: "360px",
    paddingBlock: "3.5rem",
    paddingInline: "1.5rem",
    textAlign: "center",
  },
  emptyContent: { maxWidth: "28rem" },
  emptyIconFrame: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "1rem",
    color: tokens.textMuted,
    display: "flex",
    height: "2.75rem",
    justifyContent: "center",
    marginInline: "auto",
    width: "2.75rem",
  },
  mediumIcon: { height: "1.25rem", width: "1.25rem" },
  emptyTitle: {
    color: tokens.textStrong,
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.5rem",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: "2rem",
    marginTop: "1.25rem",
  },
  emptyText: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.75rem",
  },
  error: {
    backgroundColor: tokens.warningSurface,
    borderRadius: "0.75rem",
    color: tokens.warningText,
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.75rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    textAlign: "left",
  },
  root: { display: "flex", flexDirection: "column", gap: "1.5rem" },
  panel: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "26px",
    borderStyle: "solid",
    borderWidth: 1,
    padding: { default: "1.25rem", "@media (min-width: 640px)": "1.5rem" },
  },
  panelHeader: {
    alignItems: "flex-start",
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
  },
  headingGroup: { alignItems: "flex-start", display: "flex", gap: "0.75rem" },
  headingIconFrame: {
    alignItems: "center",
    backgroundColor: tokens.selected,
    borderRadius: "0.5rem",
    color: tokens.olive,
    display: "flex",
    flexShrink: 0,
    height: "2rem",
    justifyContent: "center",
    marginTop: "0.125rem",
    width: "2rem",
  },
  heading: {
    color: tokens.textStrong,
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.25rem",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: "1.75rem",
  },
  description: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.25rem",
    maxWidth: "42rem",
  },
  stats: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 1024px)": "repeat(4, minmax(0, 1fr))",
    },
    marginTop: "1.5rem",
  },
  metadata: {
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: tokens.textSoft,
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.75rem",
    columnGap: "1.25rem",
    rowGap: "0.25rem",
    lineHeight: "1rem",
    marginTop: "1rem",
    paddingTop: "1rem",
  },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  columns: {
    display: "grid",
    gap: "1.5rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 1280px)": "minmax(280px, 0.65fr) minmax(0, 1.35fr)",
    },
  },
  columnPanel: { minWidth: 0 },
  sectionHeader: {
    alignItems: "baseline",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
    paddingBottom: "1rem",
  },
  passageHeader: { alignItems: "flex-start", flexWrap: "wrap" },
  minWidth: { minWidth: 0 },
  sectionDescription: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  count: { color: tokens.textSoft, fontSize: "0.75rem", lineHeight: "1rem" },
  documentList: { display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" },
  documentButton: {
    backgroundColor: {
      default: tokens.canvas,
      ":hover": tokens.surfaceSoft,
    },
    borderColor: tokens.borderSoft,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: "0.75rem",
    paddingInline: "0.875rem",
    textAlign: "left",
    transition: "background-color 150ms, border-color 150ms",
    width: "100%",
    ":focus-visible": { outline: `2px solid ${tokens.oliveSoft}`, outlineOffset: 2 },
  },
  selectedDocument: {
    backgroundColor: tokens.selected,
    borderColor: tokens.oliveSoft,
  },
  documentTop: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  documentId: {
    color: tokens.text,
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chunkBadge: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "9999px",
    color: tokens.textMuted,
    flexShrink: 0,
    fontSize: "0.75rem",
    lineHeight: "1rem",
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
  },
  documentMeta: {
    alignItems: "center",
    color: tokens.textSoft,
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.5rem",
    lineHeight: "1rem",
    marginTop: "0.5rem",
  },
  emptyList: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "1.25rem",
  },
  dateBadge: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    fontSize: "0.75rem",
    lineHeight: "1rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.625rem",
  },
  chunks: { display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" },
  chunk: {
    backgroundColor: tokens.canvas,
    borderColor: tokens.borderSoft,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: "0.875rem",
    paddingInline: "1rem",
  },
  chunkMeta: {
    alignItems: "center",
    color: tokens.textSoft,
    columnGap: "0.75rem",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    rowGap: "0.25rem",
  },
  chunkIndex: {
    alignItems: "center",
    color: tokens.textMuted,
    display: "inline-flex",
    fontWeight: 500,
    gap: "0.25rem",
  },
  smallIcon: { height: "0.875rem", width: "0.875rem" },
  chunkText: {
    color: tokens.text,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.5rem",
    maxHeight: "6rem",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
  },
  chunkFooter: {
    alignItems: "center",
    color: tokens.textSoft,
    display: "flex",
    fontSize: "11px",
    gap: "0.5rem",
    lineHeight: "1rem",
    marginTop: "0.75rem",
  },
  noSelection: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    minHeight: "260px",
    paddingInline: "1.5rem",
    textAlign: "center",
  },
  noSelectionText: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    maxWidth: "24rem",
  },
});

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
    <div {...stylex.props(styles.stat)}>
      <p {...stylex.props(styles.statLabel)}>{label}</p>
      <p {...stylex.props(styles.statValue)}>{value}</p>
      {detail ? <p {...stylex.props(styles.statDetail)}>{detail}</p> : null}
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
    <div {...stylex.props(styles.empty)}>
      <div {...stylex.props(styles.emptyContent)}>
        <span {...stylex.props(styles.emptyIconFrame)}>
          {isLoading ? (
            <SpinnerGapIcon className={stylex.props(styles.mediumIcon, styles.spin).className} />
          ) : (
            <DatabaseIcon className={stylex.props(styles.mediumIcon).className} />
          )}
        </span>
        <h2 {...stylex.props(styles.emptyTitle)}>
          {isLoading ? "Reading the local index" : "No index is open"}
        </h2>
        <p {...stylex.props(styles.emptyText)}>
          {error
            ? "Index a file first, then refresh this inspector to read the same local SQLite database."
            : "The inspector will show documents and passages after the local vector index has been initialized."}
        </p>
        {error ? <p {...stylex.props(styles.error)}>{error}</p> : null}
        <Button
          onClick={onRefresh}
          disabled={isLoading}
          className={stylex.props(styles.secondaryButton, styles.centeredButton).className}
        >
          <ArrowClockwiseIcon className={stylex.props(styles.icon).className} />
          Refresh index
        </Button>
      </div>
    </div>
  );
}

export default function VectorDbInspector() {
  const [inspection, setInspection] = useState<VectorDbIndexInspection | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (documentId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const nextInspection = await modelWorkerFactory.vectorDb.inspect(documentId);
      setInspection(nextInspection);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read the local index.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void modelWorkerFactory.vectorDb
      .initialize(LEXICAL_INDEX_CONFIG)
      .then(() => refresh())
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to open the local index.");
        setIsLoading(false);
      });
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
    <div {...stylex.props(styles.root)}>
      <section {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.panelHeader)}>
          <div {...stylex.props(styles.headingGroup)}>
            <span {...stylex.props(styles.headingIconFrame)}>
              <DatabaseIcon className={stylex.props(styles.icon).className} />
            </span>
            <div>
              <h2 {...stylex.props(styles.heading)}>Vector database inspector</h2>
              <p {...stylex.props(styles.description)}>
                A read-only view of the documents and passages currently stored in the local
                sqlite-vec index.
              </p>
            </div>
          </div>
          <Button
            onClick={() => void refresh(selectedDocumentId ?? undefined)}
            disabled={isLoading}
            className={stylex.props(styles.secondaryButton).className}
          >
            <ArrowClockwiseIcon
              className={stylex.props(styles.icon, isLoading && styles.spin).className}
            />
            Refresh
          </Button>
        </div>

        <div {...stylex.props(styles.stats)}>
          <Stat label="Indexed documents" value={health.documentCount.toLocaleString()} />
          <Stat label="Stored chunks" value={health.chunkCount.toLocaleString()} />
          <Stat
            label="Embedding model"
            value={health.config.model}
            detail={`${health.config.dimensions} dimensions · ${health.config.metric}`}
          />
          <Stat
            label="Storage"
            value={health.persistent ? "OPFS" : "SQLite"}
            detail={`sqlite-vec ${health.sqliteVecVersion}`}
          />
        </div>

        <div {...stylex.props(styles.metadata)}>
          <span {...stylex.props(styles.mono)}>index {health.indexId}</span>
          <span>SQLite {health.sqliteVersion}</span>
          <span>chunk size {health.config.chunkSize.toLocaleString()} chars</span>
          <span>{health.config.pooling} pooling</span>
        </div>
      </section>

      <div {...stylex.props(styles.columns)}>
        <section {...stylex.props(styles.panel, styles.columnPanel)}>
          <div {...stylex.props(styles.sectionHeader)}>
            <div>
              <h2 {...stylex.props(styles.heading)}>Indexed documents</h2>
              <p {...stylex.props(styles.sectionDescription)}>
                Select a document to inspect its stored passages.
              </p>
            </div>
            <span {...stylex.props(styles.count)}>{documents.length}</span>
          </div>

          {documents.length ? (
            <div {...stylex.props(styles.documentList)}>
              {documents.map((document) => {
                const isSelected = document.documentId === selectedDocumentId;
                return (
                  <button
                    key={document.documentId}
                    type="button"
                    onClick={() => selectDocument(document.documentId)}
                    className={
                      stylex.props(styles.documentButton, isSelected && styles.selectedDocument)
                        .className
                    }
                  >
                    <div {...stylex.props(styles.documentTop)}>
                      <span {...stylex.props(styles.documentId)}>{document.documentId}</span>
                      <span {...stylex.props(styles.chunkBadge)}>{document.chunkCount} chunks</span>
                    </div>
                    <div {...stylex.props(styles.documentMeta)}>
                      <span {...stylex.props(styles.mono)}>
                        {shortenHash(document.contentHash)}
                      </span>
                      <span>·</span>
                      <span>{formatDate(document.indexedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p {...stylex.props(styles.emptyList)}>The index has no completed documents.</p>
          )}
        </section>

        <section {...stylex.props(styles.panel, styles.columnPanel)}>
          <div {...stylex.props(styles.sectionHeader, styles.passageHeader)}>
            <div {...stylex.props(styles.minWidth)}>
              <h2 {...stylex.props(styles.heading)}>
                {selectedDocument ? selectedDocument.documentId : "Stored passages"}
              </h2>
              <p {...stylex.props(styles.sectionDescription)}>
                {selectedDocument
                  ? `${chunks.length} of ${selectedDocument.chunkCount} chunks · ${selectedDocument.tokenCount.toLocaleString()} tokens`
                  : "Choose a document on the left to see what was embedded."}
              </p>
            </div>
            {selectedDocument ? (
              <span {...stylex.props(styles.dateBadge)}>
                {formatDate(selectedDocument.indexedAt)}
              </span>
            ) : null}
          </div>

          {chunks.length ? (
            <div {...stylex.props(styles.chunks)}>
              {chunks.map((chunk) => (
                <article key={chunk.chunkId} className={stylex.props(styles.chunk).className}>
                  <div {...stylex.props(styles.chunkMeta)}>
                    <span {...stylex.props(styles.chunkIndex)}>
                      <HashIcon className={stylex.props(styles.smallIcon).className} />
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
                  <p {...stylex.props(styles.chunkText)}>{chunk.content}</p>
                  <div {...stylex.props(styles.chunkFooter)}>
                    <FileTextIcon className={stylex.props(styles.smallIcon).className} />
                    <span {...stylex.props(styles.mono)}>{shortenHash(chunk.chunkId)}</span>
                    <span>·</span>
                    <span {...stylex.props(styles.mono)}>
                      content {shortenHash(chunk.contentHash)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div {...stylex.props(styles.noSelection)}>
              <p {...stylex.props(styles.noSelectionText)}>
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
