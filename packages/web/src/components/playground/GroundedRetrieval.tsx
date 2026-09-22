import { Button } from "@base-ui/react/button";
import { useAppStore } from "@/livestore/store";
import type { PromptSegment } from "@memora/ai-core";
import {
  BrainIcon,
  CaretRightIcon,
  CheckCircleIcon,
  PlayIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Streamdown } from "streamdown";
import { modelWorkerFactory } from "@/lib/model-worker";
import type { provider as ProviderRow } from "@/livestore/provider";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { setting } from "@/livestore/setting";
import { useAgent } from "@/hooks/chat/useAgent";
import { useChatModelConfig } from "@/components/chat/chatPage/useChatModelConfig";
import { chatActiveFilesQuery$, chatProvidersQuery$ } from "@/lib/chat/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { tokens } from "../../styles/stylex.stylex";
import {
  buildContextPack,
  buildGroundedChunks,
  formatContextForModel,
  formatTimestamp,
  type ContextPack,
  type GroundedTranscriptSource,
  type GroundedTranscriptWord,
} from "@/lib/playground/groundedRetrieval";
import {
  bgeEmbeddingClient,
  type BgeEmbeddingModel,
  type BgeExecutionBackend,
} from "@/lib/playground/bgeEmbeddingClient";
import {
  BGE_SMALL_EN_QUERY_PREFIX,
  buildBgeIndexConfig,
  DEFAULT_BGE_CHUNK_SIZE,
  DEFAULT_BGE_MODEL,
} from "@/lib/playground/vectorDbConfig";
import {
  getVectorDbContentHash,
  type VectorDbIndexedChunk,
  type VectorDbIndexHealth,
} from "@/lib/vector-db";
import {
  getNanoBeirChunkId,
  getNanoBeirContentHash,
  getNanoBeirDocumentId,
  getNanoBeirProfileTotals,
  loadNanoBeirCorpus,
  loadNanoBeirEvaluationData,
  NANO_BEIR_DATASETS,
  NANO_BEIR_PROFILES,
  NANO_BEIR_REVISION,
  type NanoBeirDatasetId,
  type NanoBeirEvaluationData,
  type NanoBeirProfileId,
} from "@/lib/playground/nanoBeir";
import {
  evaluateRetrievalCase,
  summarizeRetrievalBenchmark,
  type RetrievalBenchmarkCase,
  type RetrievalBenchmarkReport,
} from "@/lib/playground/retrievalBenchmark";
import {
  DEFAULT_RRF_K,
  RRF_K_OPTIONS,
  type RrfKOption,
} from "@/lib/vector-db/reciprocalRankFusion";
import {
  MEMORA_STREAMDOWN_CLASS_NAME,
  MEMORA_STREAMDOWN_CONTROLS,
  MEMORA_STREAMDOWN_PLUGINS,
  MEMORA_STREAMDOWN_THEME,
} from "@/lib/streamdown";
import { cat } from "@memora/fs";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: "1.75rem" },
  topGrid: {
    display: "grid",
    gap: "1.75rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 1280px)": "minmax(320px,0.83fr) minmax(0,1.35fr)",
    },
  },
  panel: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "26px",
    borderStyle: "solid",
    borderWidth: 1,
    padding: { default: "1.25rem", "@media (min-width: 640px)": "1.5rem" },
  },
  boundaryPanel: { minWidth: 0 },
  introRow: { alignItems: "flex-start", display: "flex", gap: "0.75rem" },
  brainFrame: {
    alignItems: "center",
    backgroundColor: tokens.selected,
    borderRadius: "0.5rem",
    color: "var(--color-memora-olive)",
    display: "flex",
    flexShrink: 0,
    height: "2rem",
    justifyContent: "center",
    marginTop: "0.125rem",
    width: "2rem",
  },
  icon16: { height: "1rem", width: "1rem" },
  icon16Olive: { color: "var(--color-memora-olive)", height: "1rem", width: "1rem" },
  title: {
    color: "var(--color-memora-text-strong)",
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.25rem",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: "1.75rem",
  },
  description: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.25rem",
  },
  questionLabel: {
    color: "var(--color-memora-text)",
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    marginTop: "1.5rem",
  },
  textarea: {
    backgroundColor: "var(--color-memora-canvas)",
    borderColor: { default: "var(--color-memora-border)", ":focus": "var(--color-memora-olive)" },
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.5rem",
    minHeight: "6rem",
    outline: "none",
    paddingBlock: "0.625rem",
    paddingInline: "0.75rem",
    resize: "vertical",
    width: "100%",
    "::placeholder": { color: "var(--color-memora-text-soft)" },
    ":focus": { boxShadow: "0 0 0 2px var(--color-memora-olive-soft)" },
  },
  sectionHeader: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
    marginTop: "1.5rem",
  },
  headingSmall: { color: "var(--color-memora-text)", fontSize: "0.875rem", fontWeight: 500 },
  soft12: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem" },
  transcriptList: {
    backgroundColor: "var(--color-memora-canvas)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    marginTop: "0.5rem",
    maxHeight: "13rem",
    overflow: "auto",
    padding: "0.375rem",
  },
  transcriptRow: {
    alignItems: "center",
    borderRadius: "0.5rem",
    cursor: "pointer",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.625rem",
    ":hover": { backgroundColor: "var(--color-memora-surface-soft)" },
  },
  checkbox: {
    accentColor: "var(--color-memora-olive)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.25rem",
    height: "1rem",
    width: "1rem",
    ":focus": { boxShadow: "0 0 0 2px var(--color-memora-olive-soft)" },
  },
  transcriptName: {
    color: "var(--color-memora-text)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  transcriptType: { color: "var(--color-memora-text-soft)", flexShrink: 0, fontSize: "0.75rem" },
  emptyTranscripts: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    paddingBlock: "1.25rem",
    paddingInline: "0.75rem",
  },
  configGrid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "repeat(3,minmax(0,1fr))",
    },
    marginTop: "1.5rem",
  },
  fieldLabel: {
    color: "var(--color-memora-text-muted)",
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  input: {
    backgroundColor: "var(--color-memora-canvas)",
    borderColor: { default: "var(--color-memora-border)", ":focus": "var(--color-memora-olive)" },
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    height: "2.5rem",
    marginTop: "0.375rem",
    outline: "none",
    paddingInline: "0.625rem",
    width: "100%",
    ":disabled": { opacity: 0.5 },
  },
  disabledCursor: { ":disabled": { cursor: "not-allowed" } },
  helpText: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  warning: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderRadius: "0.75rem",
    color: "var(--color-memora-warning-text)",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.5rem",
    lineHeight: "1.25rem",
    marginTop: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  warningIcon: { flexShrink: 0, height: "1rem", marginTop: "0.125rem", width: "1rem" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-text)",
      ":hover": "var(--color-memora-text-strong)",
    },
    borderRadius: "0.75rem",
    color: "var(--color-memora-surface)",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    height: "2.5rem",
    justifyContent: "center",
    paddingInline: "1rem",
    transition: "background-color 150ms",
    ":disabled": { cursor: "not-allowed", opacity: 0.45 },
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-surface)",
      ":hover": "var(--color-memora-surface-soft)",
    },
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text)",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    height: "2.5rem",
    justifyContent: "center",
    paddingInline: "1rem",
    transition: "background-color 150ms",
    ":disabled": { cursor: "not-allowed", opacity: 0.45 },
  },
  fullButton: { marginTop: "1.5rem", width: "100%" },
  secondaryFull: { marginTop: "0.75rem", width: "100%" },
  semanticLabel: { marginTop: "1.25rem" },
  backendBadge: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    display: "inline-flex",
    fontSize: "0.75rem",
    fontWeight: 500,
    marginTop: "0.75rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.625rem",
  },
  indexCard: {
    backgroundColor: "var(--color-memora-canvas)",
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: "1rem",
    padding: "0.75rem",
  },
  rowBetween: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  indexTitle: { color: "var(--color-memora-text)", fontSize: "0.75rem", fontWeight: 500 },
  body12: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  indexId: {
    color: "var(--color-memora-text-soft)",
    fontFamily: "monospace",
    fontSize: "0.6875rem",
    marginTop: "0.25rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  syncText: { marginTop: "0.5rem" },
  progressText: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.75rem",
  },
  boundaryHeader: {
    alignItems: "flex-start",
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
    paddingBottom: "1.25rem",
  },
  budgetBadge: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    fontWeight: 500,
    paddingBlock: "0.25rem",
    paddingInline: "0.625rem",
  },
  methodRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginTop: "1rem",
  },
  method: {
    borderRadius: "0.5rem",
    color: {
      default: "var(--color-memora-text-muted)",
      ":hover": "var(--color-memora-text-muted)",
    },
    fontSize: "0.75rem",
    fontWeight: 500,
    paddingBlock: "0.375rem",
    paddingInline: "0.625rem",
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "var(--color-memora-surface-soft)" },
    ":disabled": { cursor: "not-allowed", opacity: 0.45 },
  },
  methodActive: {
    backgroundColor: tokens.selected,
    color: "var(--color-memora-olive)",
    ":hover": { backgroundColor: tokens.selected },
  },
  contextStats: {
    color: "var(--color-memora-text-muted)",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.75rem",
    gap: "0.5rem",
    marginTop: "1rem",
  },
  chunkList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginTop: "1rem",
    maxHeight: "420px",
    overflow: "auto",
    paddingRight: "0.25rem",
  },
  chunk: {
    backgroundColor: "var(--color-memora-canvas)",
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  chunkHeader: {
    alignItems: "center",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.75rem",
    gap: "0.25rem 0.75rem",
    justifyContent: "space-between",
  },
  chunkSource: { color: "var(--color-memora-text)", fontWeight: 500 },
  chunkMeta: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    justifyContent: "flex-end",
  },
  cosine: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "0.375rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-soft)",
    fontFamily: "monospace",
    fontSize: "0.6875rem",
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
  },
  chunkText: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.5rem",
    whiteSpace: "pre-wrap",
  },
  modelSection: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "1.25rem",
    paddingTop: "1.25rem",
  },
  modelHeader: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  agentError: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderRadius: "0.75rem",
    color: "var(--color-memora-warning-text)",
    fontSize: "0.875rem",
    marginTop: "0.75rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  response: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "1.25rem",
    paddingTop: "1.25rem",
  },
  responseTitle: {
    alignItems: "center",
    color: "var(--color-memora-text)",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
  },
  streamdownSpacing: { marginTop: "0.75rem" },
  boundaryEmpty: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    minHeight: "420px",
    textAlign: "center",
  },
  emptyCopy: { maxWidth: "24rem" },
  emptyTitle: {
    color: "var(--color-memora-text-strong)",
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.25rem",
    fontWeight: 500,
  },
  benchmarkHeader: {
    alignItems: "flex-start",
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
  },
  benchmarkCopy: { maxWidth: "42rem" },
  benchmarkGrid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 768px)": "repeat(2,minmax(0,1fr))",
      "@media (min-width: 1024px)": "minmax(0,1fr) minmax(220px,0.45fr) minmax(180px,0.3fr)",
    },
    marginTop: "1.25rem",
  },
  profileCard: {
    backgroundColor: "var(--color-memora-canvas)",
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: "1rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  wrapBetween: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    justifyContent: "space-between",
  },
  link: {
    color: "var(--color-memora-olive)",
    fontSize: "0.75rem",
    fontWeight: 500,
    ":hover": { textDecoration: "underline" },
  },
  mono: { fontFamily: "monospace" },
  datasetList: { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" },
  dataset: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.625rem",
  },
  examples: { marginTop: "1rem" },
  sampleGrid: {
    display: "grid",
    gap: "0.5rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 768px)": "repeat(2,minmax(0,1fr))",
    },
    marginTop: "0.5rem",
  },
  sample: {
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  sampleDataset: { color: "var(--color-memora-text)", fontWeight: 500 },
  separator: { color: "var(--color-memora-text-soft)", marginInline: "0.375rem" },
  benchmarkProgress: {
    backgroundColor: tokens.selected,
    borderRadius: "0.5rem",
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    marginTop: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  report: { marginTop: "1.25rem" },
  scoreGrid: {
    backgroundColor: "var(--color-memora-canvas)",
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "repeat(2,minmax(0,1fr))",
      "@media (min-width: 1024px)": "repeat(4,minmax(0,1fr))",
    },
    overflow: "hidden",
  },
  score: {
    borderLeftColor: {
      default: "transparent",
      "@media (min-width: 1024px)": "var(--color-memora-border-soft)",
    },
    borderLeftStyle: "solid",
    borderLeftWidth: { default: 0, "@media (min-width: 1024px)": 1 },
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
    ":first-child": { borderLeftWidth: 0 },
  },
  scoreLabel: { color: "var(--color-memora-text-muted)", fontSize: "0.75rem", fontWeight: 500 },
  scoreValue: {
    color: "var(--color-memora-text-strong)",
    fontFamily: "monospace",
    fontSize: "1.5rem",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    marginTop: "0.25rem",
  },
  reportMeta: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem", marginTop: "0.75rem" },
  reportDetail: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  tableWrap: {
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: "1rem",
    overflowX: "auto",
  },
  table: { borderCollapse: "collapse", minWidth: "760px", textAlign: "left", width: "100%" },
  detailTable: { minWidth: "920px" },
  tableHead: {
    backgroundColor: "var(--color-memora-canvas)",
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
  },
  stickyHead: { position: "sticky", top: 0 },
  thWide: { fontWeight: 500, paddingBlock: "0.625rem", paddingInline: "1rem" },
  th: { fontWeight: 500, paddingBlock: "0.625rem", paddingInline: "0.75rem" },
  alignRight: { textAlign: "right" },
  tableRow: {
    borderTopColor: "var(--color-memora-border-soft)",
    borderTopStyle: "solid",
    borderTopWidth: { default: 1, ":first-child": 0 },
    color: "var(--color-memora-text)",
  },
  tdWide: { paddingBlock: "0.75rem", paddingInline: "1rem" },
  td: { padding: "0.75rem" },
  datasetDomain: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    marginLeft: "0.5rem",
  },
  numeric: {
    color: "var(--color-memora-text-muted)",
    fontFamily: "monospace",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
  },
  details: {
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: "1rem",
  },
  summary: {
    color: "var(--color-memora-text)",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  detailsScroll: {
    borderTopColor: "var(--color-memora-border-soft)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    maxHeight: "560px",
    overflow: "auto",
  },
  query: { lineHeight: "1.25rem", maxWidth: "36rem" },
  emptyBenchmark: {
    backgroundColor: "var(--color-memora-canvas)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.75rem",
    borderStyle: "dashed",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "1.25rem",
    paddingBlock: "1.25rem",
    paddingInline: "1rem",
  },
});
const EMPTY_MODEL = {
  id: "unconfigured",
  name: "Unconfigured",
  api: "memora-unconfigured",
  provider: "memora-unconfigured",
  baseUrl: "memora://unconfigured",
  reasoning: false,
  input: ["text"] as Array<"text">,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1,
  maxTokens: 1,
};
const GROUNDED_RETRIEVAL_PROMPT: PromptSegment = {
  id: "playground-grounded-retrieval",
  priority: 100,
  content:
    "You are running a grounded retrieval experiment. You have no file, search, or web tools. Treat only the supplied transcript context as evidence.",
};

type TranscriptFile = LiveStoreFile & { transcriptPath: string };
type RetrievalMethod = "keyword" | "bge";
type BenchmarkRetrievalMethod =
  | "dense"
  | "bm25"
  | "rrf-equal"
  | "rrf-semantic"
  | "rrf-semantic-3"
  | "rrf-semantic-4";
type RetrievalProgressReporter = (label: string) => void;
type IndexInputChunk = Omit<VectorDbIndexedChunk, "embedding" | "contentHash">;
interface IndexInputDocument {
  documentId: string;
  contentHash: string;
  chunks: IndexInputChunk[];
}
interface IndexSyncSummary {
  health: VectorDbIndexHealth;
  reusedDocumentCount: number;
  indexedDocumentCount: number;
  embeddedChunkCount: number;
  resumedChunkCount: number;
}
interface NanoBeirBenchmarkReport extends RetrievalBenchmarkReport {
  profileId: NanoBeirProfileId;
  method: BenchmarkRetrievalMethod;
  rrfK: number | null;
  indexSync: IndexSyncSummary;
}
const BGE_MODELS: Record<BgeEmbeddingModel, { label: string; description: string }> = {
  "bge-small-en": {
    label: "BGE small EN",
    description: "Small English model for the lightweight baseline.",
  },
  "bge-m3": {
    label: "BGE-M3",
    description:
      "Multilingual 1024-dimension model; downloads one 569 MB q8 model, prefers WebGPU, and falls back to WASM.",
  },
};
const BGE_SMALL_EN_MAX_VECTOR_DISTANCE = 0.45;
const HYBRID_LEXICAL_WEIGHT = 1;
const HYBRID_SEMANTIC_WEIGHT = 2;
const BENCHMARK_METHODS: Record<
  BenchmarkRetrievalMethod,
  {
    label: string;
    usesLexical: boolean;
    usesSemantic: boolean;
    lexicalWeight: number;
    semanticWeight: number;
    usesRrf: boolean;
  }
> = {
  dense: {
    label: "Dense vector",
    usesLexical: false,
    usesSemantic: true,
    lexicalWeight: 0,
    semanticWeight: 1,
    usesRrf: false,
  },
  bm25: {
    label: "BM25 / FTS only",
    usesLexical: true,
    usesSemantic: false,
    lexicalWeight: 1,
    semanticWeight: 0,
    usesRrf: false,
  },
  "rrf-equal": {
    label: "Classic RRF · vector 1 + FTS 1",
    usesLexical: true,
    usesSemantic: true,
    lexicalWeight: 1,
    semanticWeight: 1,
    usesRrf: true,
  },
  "rrf-semantic": {
    label: "Weighted RRF · vector 2 + FTS 1",
    usesLexical: true,
    usesSemantic: true,
    lexicalWeight: HYBRID_LEXICAL_WEIGHT,
    semanticWeight: HYBRID_SEMANTIC_WEIGHT,
    usesRrf: true,
  },
  "rrf-semantic-3": {
    label: "Weighted RRF · vector 3 + FTS 1",
    usesLexical: true,
    usesSemantic: true,
    lexicalWeight: 1,
    semanticWeight: 3,
    usesRrf: true,
  },
  "rrf-semantic-4": {
    label: "Weighted RRF · vector 4 + FTS 1",
    usesLexical: true,
    usesSemantic: true,
    lexicalWeight: 1,
    semanticWeight: 4,
    usesRrf: true,
  },
};
const getEmbeddingCacheKey = (model: BgeEmbeddingModel, chunk: IndexInputChunk): string => {
  return `${model}:${chunk.chunkId}:${chunk.content}`;
};

const isTranscriptFile = (file: LiveStoreFile): file is TranscriptFile => {
  return (file.type === "audio" || file.type === "video") && Boolean(file.transcriptPath);
};

const parseWords = (content: string): GroundedTranscriptWord[] => {
  try {
    const parsed = JSON.parse(content) as { words?: unknown };
    if (!Array.isArray(parsed.words)) return [];
    return parsed.words.flatMap((word) => {
      if (!word || typeof word !== "object") return [];
      const item = word as { text?: unknown; timestamp?: unknown };
      if (
        typeof item.text !== "string" ||
        !Array.isArray(item.timestamp) ||
        item.timestamp.length !== 2 ||
        typeof item.timestamp[0] !== "number" ||
        typeof item.timestamp[1] !== "number"
      ) {
        return [];
      }
      return [
        { text: item.text, timestamp: [item.timestamp[0], item.timestamp[1]] as [number, number] },
      ];
    });
  } catch {
    return [];
  }
};

const buildQuestionPrompt = (question: string, context: string): string => {
  return `Answer the question using only the transcript context below. If the context does not support an answer, say so. Cite the provided source and timestamp beside factual claims.\n\nQuestion: ${question}\n\nTranscript context:\n${context}`;
};

const formatElapsed = (value: number | null): string => {
  if (value === null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
};

export default function GroundedRetrieval() {
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$) as setting;
  const providers = store.useQuery(chatProvidersQuery$) as ProviderRow[];
  const files = store.useQuery(chatActiveFilesQuery$) as LiveStoreFile[];
  const transcriptFiles = useMemo(() => files.filter(isTranscriptFile), [files]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [chunkSize, setChunkSize] = useState(DEFAULT_BGE_CHUNK_SIZE);
  const [topK, setTopK] = useState(4);
  const [contextBudget, setContextBudget] = useState(3600);
  const [keywordPack, setKeywordPack] = useState<ContextPack | null>(null);
  const [bgePack, setBgePack] = useState<ContextPack | null>(null);
  const [preparedChunks, setPreparedChunks] = useState<ReturnType<typeof buildGroundedChunks>>([]);
  const [activeMethod, setActiveMethod] = useState<RetrievalMethod>("keyword");
  const [keywordElapsedMs, setKeywordElapsedMs] = useState<number | null>(null);
  const [bgeElapsedMs, setBgeElapsedMs] = useState<number | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [bgeError, setBgeError] = useState<string | null>(null);
  const [isRunningBge, setIsRunningBge] = useState(false);
  const [bgeProgress, setBgeProgress] = useState<string | null>(null);
  const [bgeModel, setBgeModel] = useState<BgeEmbeddingModel>(DEFAULT_BGE_MODEL);
  const [bgeBackend, setBgeBackend] = useState<BgeExecutionBackend | null>(null);
  const [indexHealth, setIndexHealth] = useState<VectorDbIndexHealth | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [benchmarkProfileId, setBenchmarkProfileId] = useState<NanoBeirProfileId>("quick");
  const [benchmarkMethod, setBenchmarkMethod] = useState<BenchmarkRetrievalMethod>("dense");
  const [benchmarkRrfK, setBenchmarkRrfK] = useState<RrfKOption>(DEFAULT_RRF_K);
  const [benchmarkPreview, setBenchmarkPreview] = useState<NanoBeirEvaluationData[]>([]);
  const [isLoadingBenchmarkPreview, setIsLoadingBenchmarkPreview] = useState(false);
  const [benchmarkReport, setBenchmarkReport] = useState<NanoBeirBenchmarkReport | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [benchmarkProgress, setBenchmarkProgress] = useState<string | null>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [lastIndexSync, setLastIndexSync] = useState<IndexSyncSummary | null>(null);
  const bgeEmbeddingCacheRef = useRef<Map<string, Float32Array>>(new Map());
  const hasInitializedTranscriptSelectionRef = useRef(false);

  const { agentConfig, runtime, isConfigured, selectedModelInfo } = useChatModelConfig({
    providers,
    settings,
    activeSessionId: "playground-grounded-retrieval",
  });
  const {
    messages,
    isStreaming,
    error: agentError,
    send,
    abort,
    reset,
  } = useAgent({
    sessionId: "playground-grounded-retrieval",
    initialMessages: [],
    config: { ...agentConfig, maxIterations: 1 },
    model: runtime?.model ?? EMPTY_MODEL,
    stream:
      runtime?.stream ??
      (() => {
        throw new Error("Select a configured provider and model before running this experiment.");
      }),
    promptSegments: [GROUNDED_RETRIEVAL_PROMPT],
  });
  const answer = messages.at(-1)?.role === "assistant" ? messages.at(-1)?.content : "";
  const contextPack = activeMethod === "bge" ? bgePack : keywordPack;
  const benchmarkProfile = NANO_BEIR_PROFILES[benchmarkProfileId];
  const benchmarkTotals = useMemo(
    () => getNanoBeirProfileTotals(benchmarkProfile),
    [benchmarkProfile],
  );
  const benchmarkQuerySamples = useMemo(() => {
    return benchmarkPreview
      .flatMap((dataset) =>
        dataset.queries.slice(0, 3).map((query) => ({
          id: `${dataset.definition.id}:${query.id}`,
          datasetLabel: dataset.definition.label,
          text: query.text,
        })),
      )
      .slice(0, 8);
  }, [benchmarkPreview]);
  const benchmarkDatasetReports = useMemo(() => {
    if (!benchmarkReport) return [];
    return benchmarkProfile.datasetIds.map((datasetId) => {
      const cases = benchmarkReport.cases.filter((item) => item.datasetId === datasetId);
      return {
        definition: NANO_BEIR_DATASETS[datasetId],
        report: summarizeRetrievalBenchmark(cases, 0, 0),
      };
    });
  }, [benchmarkProfile, benchmarkReport]);

  useEffect(() => {
    if (hasInitializedTranscriptSelectionRef.current || !transcriptFiles.length) return;
    setSelectedIds(transcriptFiles.map((file) => file.id));
    hasInitializedTranscriptSelectionRef.current = true;
  }, [transcriptFiles]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingBenchmarkPreview(true);
    setBenchmarkError(null);
    void Promise.all(
      benchmarkProfile.datasetIds.map((datasetId) => loadNanoBeirEvaluationData(datasetId)),
    )
      .then((datasets) => {
        if (!cancelled) setBenchmarkPreview(datasets);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setBenchmarkPreview([]);
        setBenchmarkError(
          reason instanceof Error ? reason.message : "Unable to load the NanoBEIR query preview.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBenchmarkPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [benchmarkProfile]);

  const selectedFiles = useMemo(() => {
    const ids = new Set(selectedIds);
    return transcriptFiles.filter((file) => ids.has(file.id));
  }, [selectedIds, transcriptFiles]);

  const toggleFile = useCallback((fileId: string) => {
    setSelectedIds((current) =>
      current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId],
    );
    setKeywordPack(null);
    setBgePack(null);
    setPreparedChunks([]);
    setBgeElapsedMs(null);
    setKeywordElapsedMs(null);
    setActiveMethod("keyword");
  }, []);

  const loadSelectedTranscriptSources = useCallback(async (): Promise<
    GroundedTranscriptSource[]
  > => {
    const sources = await Promise.all(
      selectedFiles.map(async (file): Promise<GroundedTranscriptSource | null> => {
        const words = parseWords(await cat(file.transcriptPath));
        return words.length ? { id: file.id, name: file.name, words } : null;
      }),
    );
    return sources.flatMap((source) => (source ? [source] : []));
  }, [selectedFiles]);

  const prepareContext = useCallback(async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setPrepareError("Enter a question before preparing context.");
      return;
    }
    if (!selectedFiles.length) {
      setPrepareError("Select at least one local transcript.");
      return;
    }

    setPrepareError(null);
    setIsPreparing(true);
    try {
      const usableSources = await loadSelectedTranscriptSources();
      if (!usableSources.length) {
        setPrepareError("The selected files do not contain timestamped transcript words yet.");
        return;
      }
      const startedAt = performance.now();
      const chunks = buildGroundedChunks(usableSources, trimmedQuestion, chunkSize);
      const nextPack = buildContextPack(chunks, topK, contextBudget);
      setKeywordPack(nextPack);
      setBgePack(null);
      setPreparedChunks(chunks);
      setKeywordElapsedMs(performance.now() - startedAt);
      setBgeElapsedMs(null);
      setActiveMethod("keyword");
      if (!nextPack.chunks.length) {
        setPrepareError(
          nextPack.candidateCount === 0
            ? "The keyword baseline found no matching chunk. You can now run BGE semantic retrieval for this same question."
            : "The matching chunks exceed the current context budget. Increase the budget or reduce the chunk size.",
        );
        return;
      }
      await reset({ messages: [] });
    } catch (reason) {
      setPrepareError(
        reason instanceof Error ? reason.message : "Unable to read the selected transcripts.",
      );
    } finally {
      setIsPreparing(false);
    }
  }, [
    chunkSize,
    contextBudget,
    loadSelectedTranscriptSources,
    question,
    reset,
    selectedFiles,
    topK,
  ]);

  const syncBgeDocuments = useCallback(
    async (
      documents: IndexInputDocument[],
      reportProgress: RetrievalProgressReporter,
    ): Promise<IndexSyncSummary> => {
      reportProgress("Opening the persistent OPFS index…");
      const initializedHealth = await modelWorkerFactory.vectorDb.initialize(
        buildBgeIndexConfig(bgeModel, chunkSize),
      );
      setIndexHealth(initializedHealth);
      setIndexError(null);

      const statuses = await modelWorkerFactory.vectorDb.checkDocuments(
        documents.map(({ documentId, contentHash }) => ({ documentId, contentHash })),
      );
      const changedIds = new Set(
        statuses.filter((status) => !status.matches).map((status) => status.documentId),
      );
      const changedDocuments = documents.filter((document) => changedIds.has(document.documentId));
      const batchSize = 12;
      let reusedDocumentCount = documents.length - changedDocuments.length;
      let indexedDocumentCount = 0;
      let embeddedChunkCount = 0;
      let resumedChunkCount = 0;
      for (let documentIndex = 0; documentIndex < changedDocuments.length; documentIndex += 1) {
        const document = changedDocuments[documentIndex];
        if (!document) continue;
        const chunkContentHashes = await Promise.all(
          document.chunks.map((chunk) => getVectorDbContentHash(chunk.content)),
        );
        const preparedChunks = document.chunks.map((chunk, chunkIndex) => ({
          ...chunk,
          documentId: document.documentId,
          chunkIndex,
          contentHash: chunkContentHashes[chunkIndex] ?? document.contentHash,
        }));
        const plan = {
          documentId: document.documentId,
          contentHash: document.contentHash,
          indexedAt: Date.now(),
          chunks: preparedChunks.map((chunk) => ({
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            contentHash: chunk.contentHash,
          })),
        };
        const checkpoint = await modelWorkerFactory.vectorDb.prepareDocument(plan);
        if (checkpoint.complete) {
          reusedDocumentCount += 1;
          continue;
        }

        const persistedChunkIds = new Set(checkpoint.persistedChunkIds);
        resumedChunkCount += persistedChunkIds.size;
        const pendingChunks = preparedChunks.filter(
          (chunk) => !persistedChunkIds.has(chunk.chunkId),
        );
        for (let start = 0; start < pendingChunks.length; start += batchSize) {
          const batch = pendingChunks.slice(start, start + batchSize);
          const chunksToEmbed = batch.filter((chunk) => {
            return !bgeEmbeddingCacheRef.current.has(getEmbeddingCacheKey(bgeModel, chunk));
          });
          if (chunksToEmbed.length) {
            reportProgress(
              `Embedding document ${documentIndex + 1} of ${changedDocuments.length}: ${Math.min(start + batch.length, pendingChunks.length)} of ${pendingChunks.length} passages`,
            );
            const vectors = await bgeEmbeddingClient.embed(
              bgeModel,
              chunksToEmbed.map((chunk) => chunk.content),
            );
            chunksToEmbed.forEach((chunk, index) => {
              const vector = vectors[index];
              if (vector) {
                bgeEmbeddingCacheRef.current.set(getEmbeddingCacheKey(bgeModel, chunk), vector);
              }
            });
            embeddedChunkCount += chunksToEmbed.length;
          }

          const indexedBatch: VectorDbIndexedChunk[] = batch.map((chunk) => {
            const embedding = bgeEmbeddingCacheRef.current.get(
              getEmbeddingCacheKey(bgeModel, chunk),
            );
            if (!embedding) throw new Error(`Missing embedding for chunk ${chunk.chunkId}.`);
            return { ...chunk, embedding };
          });
          const writeResult = await modelWorkerFactory.vectorDb.upsertChunkBatch({
            documentId: document.documentId,
            contentHash: document.contentHash,
            chunks: indexedBatch,
          });
          indexedBatch.forEach((chunk) => {
            bgeEmbeddingCacheRef.current.delete(getEmbeddingCacheKey(bgeModel, chunk));
          });
          reportProgress(
            `Saved ${writeResult.persistedChunkCount} of ${preparedChunks.length} passages to OPFS`,
          );
        }
        await modelWorkerFactory.vectorDb.finalizeDocument(plan);
        indexedDocumentCount += 1;
      }
      const indexedHealth = await modelWorkerFactory.vectorDb.health();
      setIndexHealth(indexedHealth);
      const summary = {
        health: indexedHealth,
        reusedDocumentCount,
        indexedDocumentCount,
        embeddedChunkCount,
        resumedChunkCount,
      };
      setLastIndexSync(summary);
      if (!changedDocuments.length) {
        reportProgress(`Reused ${documents.length} unchanged OPFS index documents.`);
      }
      return summary;
    },
    [bgeModel, chunkSize],
  );

  const ensureBgeIndex = useCallback(
    async (
      chunks: ReturnType<typeof buildGroundedChunks>,
      reportProgress: RetrievalProgressReporter,
    ): Promise<IndexSyncSummary> => {
      const chunksByDocument = new Map<string, typeof chunks>();
      for (const chunk of chunks) {
        const documentChunks = chunksByDocument.get(chunk.sourceId) ?? [];
        documentChunks.push(chunk);
        chunksByDocument.set(chunk.sourceId, documentChunks);
      }
      const documents = await Promise.all(
        [...chunksByDocument].map(async ([documentId, documentChunks]) => {
          const orderedChunks = [...documentChunks].sort(
            (left, right) =>
              left.timestamp[0] - right.timestamp[0] || left.id.localeCompare(right.id),
          );
          return {
            documentId,
            contentHash: await getVectorDbContentHash(
              orderedChunks.map((chunk) => `${chunk.id}\n${chunk.text}`).join("\n"),
            ),
            chunks: orderedChunks.map((chunk, chunkIndex) => ({
              chunkId: chunk.id,
              documentId,
              chunkIndex,
              content: chunk.text,
              startOffset: chunk.timestamp[0],
              endOffset: chunk.timestamp[1],
              headingPath: [chunk.sourceName],
            })),
          } satisfies IndexInputDocument;
        }),
      );
      return syncBgeDocuments(documents, reportProgress);
    },
    [syncBgeDocuments],
  );

  const runBgeComparison = useCallback(async () => {
    const trimmedQuestion = question.trim();
    if (!preparedChunks.length || !trimmedQuestion) return;

    setBgeError(null);
    setBgeProgress("Starting the local BGE worker…");
    setBgeBackend(null);
    setIsRunningBge(true);
    const startedAt = performance.now();
    try {
      const modelQuestion =
        bgeModel === "bge-small-en"
          ? `${BGE_SMALL_EN_QUERY_PREFIX}${trimmedQuestion}`
          : trimmedQuestion;
      const [queryEmbedding] = await bgeEmbeddingClient.embed(
        bgeModel,
        [modelQuestion],
        (update) => {
          if (update.type === "backend") {
            setBgeBackend(update.backend);
            return;
          }
          setBgeProgress(update.label);
        },
      );
      await ensureBgeIndex(preparedChunks, setBgeProgress);
      setBgeProgress("Searching the persisted chunks…");
      const hits = await modelWorkerFactory.vectorDb.search({
        query: trimmedQuestion,
        queryEmbedding,
        scope: { kind: "documents", documentIds: selectedFiles.map((file) => file.id) },
        topK,
        lexicalCandidateK: Math.max(50, topK * 5),
        semanticCandidateK: Math.max(50, topK * 5),
        lexicalWeight: HYBRID_LEXICAL_WEIGHT,
        semanticWeight: HYBRID_SEMANTIC_WEIGHT,
        maxVectorDistance:
          bgeModel === "bge-small-en" ? BGE_SMALL_EN_MAX_VECTOR_DISTANCE : undefined,
      });
      const chunksById = new Map(preparedChunks.map((chunk) => [chunk.id, chunk]));
      const semanticChunks = hits.flatMap((hit) => {
        const chunk = chunksById.get(hit.chunkId);
        if (!chunk) return [];
        const vectorDistance = hit.vectorDistance;
        return [
          {
            ...chunk,
            score: hit.score,
            vectorDistance,
            cosineSimilarity:
              vectorDistance === undefined
                ? undefined
                : Math.max(-1, Math.min(1, 1 - vectorDistance)),
          },
        ];
      });
      const nextPack = buildContextPack(semanticChunks, topK, contextBudget, true);
      if (!nextPack.chunks.length) {
        setBgeError(
          hits.length === 0
            ? "The local index found no sufficiently relevant chunks for this question."
            : "The local index returned no chunks within the current context budget. Increase the budget or reduce the chunk size.",
        );
        return;
      }
      setBgePack(nextPack);
      setBgeElapsedMs(performance.now() - startedAt);
      setActiveMethod("bge");
      await reset({ messages: [] });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to run BGE locally.";
      setIndexError(message);
      setBgeError(message);
    } finally {
      setBgeProgress(null);
      setIsRunningBge(false);
    }
  }, [
    bgeModel,
    contextBudget,
    ensureBgeIndex,
    preparedChunks,
    question,
    reset,
    selectedFiles,
    topK,
  ]);

  const runRetrievalBenchmark = useCallback(async () => {
    setBenchmarkError(null);
    setBenchmarkReport(null);
    setBenchmarkProgress("Loading the pinned NanoBEIR queries and qrels…");
    setBgeBackend(null);
    setIsRunningBenchmark(true);
    const startedAt = performance.now();
    try {
      const benchmarkMethodConfig = BENCHMARK_METHODS[benchmarkMethod];
      const evaluationData: NanoBeirEvaluationData[] = [];
      for (const datasetId of benchmarkProfile.datasetIds) {
        evaluationData.push(await loadNanoBeirEvaluationData(datasetId, setBenchmarkProgress));
      }
      setBenchmarkPreview(evaluationData);

      const allCases = evaluationData.flatMap((dataset): RetrievalBenchmarkCase[] => {
        const qrelsByQuery = new Map<string, string[]>();
        for (const qrel of dataset.qrels) {
          const relevantIds = qrelsByQuery.get(qrel.queryId) ?? [];
          relevantIds.push(getNanoBeirChunkId(dataset.definition.id, qrel.corpusId));
          qrelsByQuery.set(qrel.queryId, relevantIds);
        }
        return dataset.queries.map((query) => ({
          id: `${dataset.definition.id}:${query.id}`,
          datasetId: dataset.definition.id,
          query: query.text,
          relevantDocumentIds: qrelsByQuery.get(query.id) ?? [],
        }));
      });
      const evaluableCases = allCases.filter((benchmarkCase) => {
        return benchmarkCase.relevantDocumentIds.length > 0;
      });

      setBenchmarkProgress("Checking the existing OPFS index…");
      const initializedHealth = await modelWorkerFactory.vectorDb.initialize(
        buildBgeIndexConfig(bgeModel, chunkSize),
      );
      setIndexHealth(initializedHealth);
      setIndexError(null);
      const fingerprints = benchmarkProfile.datasetIds.map((datasetId) => ({
        documentId: getNanoBeirDocumentId(datasetId),
        contentHash: getNanoBeirContentHash(datasetId),
      }));
      const statuses = await modelWorkerFactory.vectorDb.checkDocuments(fingerprints);
      const changedDatasetIds = new Set(
        statuses.flatMap((status) => {
          if (status.matches) return [];
          const datasetId = benchmarkProfile.datasetIds.find(
            (candidate) => getNanoBeirDocumentId(candidate) === status.documentId,
          );
          return datasetId ? [datasetId] : [];
        }),
      );
      const corpusByDataset = new Map<
        NanoBeirDatasetId,
        Awaited<ReturnType<typeof loadNanoBeirCorpus>>
      >();
      for (const datasetId of changedDatasetIds) {
        corpusByDataset.set(datasetId, await loadNanoBeirCorpus(datasetId, setBenchmarkProgress));
      }
      const indexDocuments = benchmarkProfile.datasetIds.map((datasetId): IndexInputDocument => {
        const documentId = getNanoBeirDocumentId(datasetId);
        return {
          documentId,
          contentHash: getNanoBeirContentHash(datasetId),
          chunks: (corpusByDataset.get(datasetId) ?? []).map((passage, chunkIndex) => ({
            chunkId: getNanoBeirChunkId(datasetId, passage.id),
            documentId,
            chunkIndex,
            content: passage.text,
            headingPath: ["NanoBEIR-en", NANO_BEIR_DATASETS[datasetId].label],
          })),
        };
      });
      const indexSync = await syncBgeDocuments(indexDocuments, setBenchmarkProgress);

      const queryEmbeddings: Float32Array[] = [];
      if (benchmarkMethodConfig.usesSemantic) {
        setBenchmarkProgress("Embedding the public benchmark queries…");
        const modelQueries = evaluableCases.map((benchmarkCase) => {
          return bgeModel === "bge-small-en"
            ? `${BGE_SMALL_EN_QUERY_PREFIX}${benchmarkCase.query}`
            : benchmarkCase.query;
        });
        const queryBatchSize = 32;
        for (let start = 0; start < modelQueries.length; start += queryBatchSize) {
          const batch = modelQueries.slice(start, start + queryBatchSize);
          const vectors = await bgeEmbeddingClient.embed(bgeModel, batch, (update) => {
            if (update.type === "backend") {
              setBgeBackend(update.backend);
              return;
            }
            setBenchmarkProgress(update.label);
          });
          queryEmbeddings.push(...vectors);
          setBenchmarkProgress(
            `Embedding queries: ${Math.min(start + batch.length, modelQueries.length)} of ${modelQueries.length}`,
          );
        }
      }

      const caseResults: RetrievalBenchmarkReport["cases"] = [];
      const scopeDocumentIds = benchmarkProfile.datasetIds.map(getNanoBeirDocumentId);
      for (let index = 0; index < evaluableCases.length; index += 1) {
        const benchmarkCase = evaluableCases[index];
        const queryEmbedding = queryEmbeddings[index];
        if (!benchmarkCase || (benchmarkMethodConfig.usesSemantic && !queryEmbedding)) {
          throw new Error("A NanoBEIR query embedding is missing.");
        }
        setBenchmarkProgress(`Searching case ${index + 1} of ${evaluableCases.length}…`);
        const queryStartedAt = performance.now();
        const hits = await modelWorkerFactory.vectorDb.search({
          query: benchmarkMethodConfig.usesLexical ? benchmarkCase.query : "",
          queryEmbedding: benchmarkMethodConfig.usesSemantic ? queryEmbedding : undefined,
          scope: { kind: "documents", documentIds: scopeDocumentIds },
          topK: 10,
          lexicalCandidateK: 50,
          semanticCandidateK: 50,
          lexicalWeight: benchmarkMethodConfig.lexicalWeight,
          semanticWeight: benchmarkMethodConfig.semanticWeight,
          rrfK: benchmarkMethodConfig.usesRrf ? benchmarkRrfK : undefined,
        });
        caseResults.push(
          evaluateRetrievalCase(
            benchmarkCase,
            hits.map((hit) => hit.chunkId),
            performance.now() - queryStartedAt,
          ),
        );
      }

      const report = summarizeRetrievalBenchmark(
        caseResults,
        allCases.length - evaluableCases.length,
        performance.now() - startedAt,
      );
      setBenchmarkReport({
        ...report,
        profileId: benchmarkProfileId,
        method: benchmarkMethod,
        rrfK: benchmarkMethodConfig.usesRrf ? benchmarkRrfK : null,
        indexSync,
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to run the benchmark.";
      setBenchmarkError(message);
    } finally {
      setBenchmarkProgress(null);
      setIsRunningBenchmark(false);
    }
  }, [
    benchmarkMethod,
    benchmarkProfile,
    benchmarkProfileId,
    benchmarkRrfK,
    bgeModel,
    chunkSize,
    syncBgeDocuments,
  ]);

  const runModel = useCallback(async () => {
    if (!contextPack || !question.trim()) return;
    await send(buildQuestionPrompt(question.trim(), formatContextForModel(contextPack)));
  }, [contextPack, question, send]);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.topGrid)}>
        <section {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.introRow)}>
            <span {...stylex.props(styles.brainFrame)}>
              <BrainIcon className={stylex.props(styles.icon16).className} />
            </span>
            <div>
              <h2 {...stylex.props(styles.title)}>Prepare local context</h2>
              <p {...stylex.props(styles.description)}>
                Choose saved transcripts, then inspect exactly what the configured model can
                receive.
              </p>
            </div>
          </div>

          <label
            className={stylex.props(styles.questionLabel).className}
            htmlFor="grounded-question"
          >
            Question
          </label>
          <textarea
            id="grounded-question"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              setKeywordPack(null);
              setBgePack(null);
              setPreparedChunks([]);
              setKeywordElapsedMs(null);
              setBgeElapsedMs(null);
            }}
            placeholder="What decision was made about the study plan?"
            className={stylex.props(styles.textarea).className}
          />

          <div {...stylex.props(styles.sectionHeader)}>
            <p {...stylex.props(styles.headingSmall)}>Local transcripts</p>
            <span {...stylex.props(styles.soft12)}>{selectedIds.length} selected</span>
          </div>
          <div {...stylex.props(styles.transcriptList)}>
            {transcriptFiles.length ? (
              transcriptFiles.map((file) => {
                const checked = selectedIds.includes(file.id);
                return (
                  <label key={file.id} {...stylex.props(styles.transcriptRow)}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFile(file.id)}
                      className={stylex.props(styles.checkbox).className}
                    />
                    <span {...stylex.props(styles.transcriptName)}>{file.name}</span>
                    <span {...stylex.props(styles.transcriptType)}>{file.type}</span>
                  </label>
                );
              })
            ) : (
              <p {...stylex.props(styles.emptyTranscripts)}>
                No saved audio or video transcripts are available yet.
              </p>
            )}
          </div>

          <div {...stylex.props(styles.configGrid)}>
            <label {...stylex.props(styles.fieldLabel)}>
              Chunk size
              <input
                type="number"
                min="120"
                max="5000"
                value={chunkSize}
                onChange={(event) => {
                  setChunkSize(Number(event.target.value));
                  setKeywordPack(null);
                  setBgePack(null);
                  setPreparedChunks([]);
                  setBenchmarkReport(null);
                }}
                className={stylex.props(styles.input).className}
              />
            </label>
            <label {...stylex.props(styles.fieldLabel)}>
              Top-k
              <input
                type="number"
                min="1"
                max="20"
                value={topK}
                onChange={(event) => {
                  setTopK(Number(event.target.value));
                  setKeywordPack(null);
                  setBgePack(null);
                  setPreparedChunks([]);
                }}
                className={stylex.props(styles.input).className}
              />
            </label>
            <label {...stylex.props(styles.fieldLabel)}>
              Context budget
              <input
                type="number"
                min="200"
                max="50000"
                value={contextBudget}
                onChange={(event) => {
                  setContextBudget(Number(event.target.value));
                  setKeywordPack(null);
                  setBgePack(null);
                  setPreparedChunks([]);
                }}
                className={stylex.props(styles.input).className}
              />
            </label>
          </div>
          <p {...stylex.props(styles.helpText)}>
            All limits are characters for this experiment. The 420-character default stays within
            the BGE small EN input limit and is also valid for BGE-M3.
          </p>
          {prepareError ? (
            <p {...stylex.props(styles.warning)}>
              <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
              {prepareError}
            </p>
          ) : null}
          <Button
            onClick={() => void prepareContext()}
            disabled={isPreparing}
            className={stylex.props(styles.primaryButton, styles.fullButton).className}
          >
            {isPreparing ? "Preparing context…" : "Prepare context"}
            <CaretRightIcon className={stylex.props(styles.icon16).className} />
          </Button>
          <label {...stylex.props(styles.fieldLabel, styles.semanticLabel)}>
            Semantic model
            <select
              value={bgeModel}
              onChange={(event) => {
                setBgeModel(event.target.value as BgeEmbeddingModel);
                setBgePack(null);
                setBgeElapsedMs(null);
                setBgeError(null);
                setBgeBackend(null);
                setActiveMethod("keyword");
                setBenchmarkReport(null);
              }}
              className={stylex.props(styles.input).className}
            >
              {Object.entries(BGE_MODELS).map(([id, model]) => (
                <option key={id} value={id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <p {...stylex.props(styles.helpText)}>{BGE_MODELS[bgeModel].description}</p>
          <span {...stylex.props(styles.backendBadge)}>
            Backend:{" "}
            {bgeBackend === "webgpu" ? "WebGPU" : bgeBackend === "wasm" ? "WASM" : "Not loaded"}
          </span>
          <div {...stylex.props(styles.indexCard)}>
            <div {...stylex.props(styles.rowBetween)}>
              <p {...stylex.props(styles.indexTitle)}>Persistent local index</p>
              <span {...stylex.props(styles.soft12)}>
                {indexHealth?.persistent ? "OPFS" : indexHealth ? "SQLite" : "Not initialized"}
              </span>
            </div>
            <p {...stylex.props(styles.body12)}>
              {indexHealth
                ? `${indexHealth.documentCount} documents · ${indexHealth.chunkCount} chunks · ${indexHealth.sqliteVecVersion}`
                : "Run semantic retrieval to initialize the SQLite + sqlite-vec database."}
            </p>
            {indexHealth ? (
              <p {...stylex.props(styles.indexId)}>indexId {indexHealth.indexId}</p>
            ) : null}
            {lastIndexSync ? (
              <p {...stylex.props(styles.body12, styles.syncText)}>
                Last sync: {lastIndexSync.reusedDocumentCount} reused ·{" "}
                {lastIndexSync.indexedDocumentCount} written · {lastIndexSync.embeddedChunkCount}{" "}
                embedded · {lastIndexSync.resumedChunkCount} resumed from OPFS
              </p>
            ) : null}
          </div>
          {indexError ? (
            <p {...stylex.props(styles.warning)}>
              <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
              {indexError}
            </p>
          ) : null}
          <Button
            onClick={() => void runBgeComparison()}
            disabled={!preparedChunks.length || isRunningBge || isRunningBenchmark}
            className={stylex.props(styles.secondaryButton, styles.secondaryFull).className}
          >
            {isRunningBge ? "Running semantic retrieval…" : `Run ${BGE_MODELS[bgeModel].label}`}
          </Button>
          {bgeProgress ? <p {...stylex.props(styles.progressText)}>{bgeProgress}</p> : null}
          {bgeError ? (
            <p {...stylex.props(styles.warning)}>
              <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
              {bgeError}
            </p>
          ) : null}
        </section>

        <section {...stylex.props(styles.panel, styles.boundaryPanel)}>
          <div {...stylex.props(styles.boundaryHeader)}>
            <div>
              <h2 {...stylex.props(styles.title)}>Model boundary</h2>
              <p {...stylex.props(styles.description)}>
                The blocks below are the whole remote context for this run.
              </p>
            </div>
            {contextPack ? (
              <span {...stylex.props(styles.budgetBadge)}>
                {contextPack.characterCount.toLocaleString()} / {contextBudget.toLocaleString()}{" "}
                chars
              </span>
            ) : null}
          </div>
          {keywordPack ? (
            <div {...stylex.props(styles.methodRow)}>
              <button
                type="button"
                onClick={() => setActiveMethod("keyword")}
                {...stylex.props(styles.method, activeMethod === "keyword" && styles.methodActive)}
              >
                Keyword baseline · {formatElapsed(keywordElapsedMs)}
              </button>
              <button
                type="button"
                onClick={() => bgePack && setActiveMethod("bge")}
                disabled={!bgePack}
                {...stylex.props(styles.method, activeMethod === "bge" && styles.methodActive)}
              >
                {BGE_MODELS[bgeModel].label} · {formatElapsed(bgeElapsedMs)}
              </button>
              <span {...stylex.props(styles.soft12)}>
                Semantic retrieval runs locally in a worker.
              </span>
            </div>
          ) : null}
          {contextPack ? (
            <>
              <div {...stylex.props(styles.contextStats)}>
                <span>{contextPack.chunks.length} included</span>
                <span>·</span>
                <span>{contextPack.candidateCount} retrieved</span>
                {contextPack.excludedByBudget ? (
                  <>
                    <span>·</span>
                    <span>{contextPack.excludedByBudget} over budget</span>
                  </>
                ) : null}
              </div>
              <div {...stylex.props(styles.chunkList)}>
                {contextPack.chunks.map((chunk) => (
                  <article key={chunk.id} {...stylex.props(styles.chunk)}>
                    <div {...stylex.props(styles.chunkHeader)}>
                      <span {...stylex.props(styles.chunkSource)}>{chunk.sourceName}</span>
                      <span {...stylex.props(styles.chunkMeta)}>
                        {chunk.cosineSimilarity !== undefined &&
                        chunk.vectorDistance !== undefined ? (
                          <span
                            className={stylex.props(styles.cosine).className}
                            title="Cosine distance equals 1 minus cosine similarity."
                          >
                            Cosine {chunk.cosineSimilarity.toFixed(3)} · distance{" "}
                            {chunk.vectorDistance.toFixed(3)}
                          </span>
                        ) : null}
                        <span>
                          {formatTimestamp(chunk.timestamp[0])}–
                          {formatTimestamp(chunk.timestamp[1])}
                        </span>
                      </span>
                    </div>
                    <p {...stylex.props(styles.chunkText)}>{chunk.text}</p>
                  </article>
                ))}
              </div>
              <div {...stylex.props(styles.modelSection)}>
                <div {...stylex.props(styles.modelHeader)}>
                  <div>
                    <p {...stylex.props(styles.headingSmall)}>Configured chat model</p>
                    <p {...stylex.props(styles.helpText)}>
                      {isConfigured
                        ? (selectedModelInfo?.name ?? "Selected model")
                        : "Choose a provider and model in Settings first."}
                    </p>
                  </div>
                  {isStreaming ? (
                    <Button
                      onClick={abort}
                      className={stylex.props(styles.secondaryButton).className}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void runModel()}
                      disabled={!isConfigured}
                      className={stylex.props(styles.primaryButton).className}
                    >
                      <PlayIcon className={stylex.props(styles.icon16).className} />
                      Ask model
                    </Button>
                  )}
                </div>
                {agentError ? (
                  <p {...stylex.props(styles.agentError)}>{agentError.message}</p>
                ) : null}
                {answer ? (
                  <div {...stylex.props(styles.response)}>
                    <div {...stylex.props(styles.responseTitle)}>
                      <CheckCircleIcon className={stylex.props(styles.icon16Olive).className} />
                      Model response
                    </div>
                    <Streamdown
                      className={`${MEMORA_STREAMDOWN_CLASS_NAME} ${stylex.props(styles.streamdownSpacing).className}`}
                      controls={MEMORA_STREAMDOWN_CONTROLS}
                      plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
                      shikiTheme={MEMORA_STREAMDOWN_THEME}
                    >
                      {answer}
                    </Streamdown>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div {...stylex.props(styles.boundaryEmpty)}>
              <div {...stylex.props(styles.emptyCopy)}>
                <p {...stylex.props(styles.emptyTitle)}>Nothing is selected for remote use.</p>
                <p {...stylex.props(styles.description)}>
                  Prepare a query to inspect the retrieved chunks before calling the model.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <section {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.benchmarkHeader)}>
          <div {...stylex.props(styles.benchmarkCopy)}>
            <h2 {...stylex.props(styles.title)}>NanoBEIR retrieval benchmark</h2>
            <p {...stylex.props(styles.description)}>
              Runs public queries and qrels from NanoBEIR-en against the same SQLite + sqlite-vec
              OPFS index used by transcript retrieval.
            </p>
          </div>
          <Button
            onClick={() => void runRetrievalBenchmark()}
            disabled={isRunningBenchmark || isRunningBge || isLoadingBenchmarkPreview}
            className={stylex.props(styles.secondaryButton).className}
          >
            {isRunningBenchmark ? "Running benchmark…" : "Run retrieval benchmark"}
          </Button>
        </div>

        <div {...stylex.props(styles.benchmarkGrid)}>
          <label {...stylex.props(styles.fieldLabel)}>
            Evaluation profile
            <select
              value={benchmarkProfileId}
              onChange={(event) => {
                setBenchmarkProfileId(event.target.value as NanoBeirProfileId);
                setBenchmarkReport(null);
                setBenchmarkPreview([]);
              }}
              disabled={isRunningBenchmark}
              className={stylex.props(styles.input).className}
            >
              {Object.values(NANO_BEIR_PROFILES).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label} — {profile.description}
                </option>
              ))}
            </select>
          </label>
          <label {...stylex.props(styles.fieldLabel)}>
            Retrieval method
            <select
              value={benchmarkMethod}
              onChange={(event) => {
                setBenchmarkMethod(event.target.value as BenchmarkRetrievalMethod);
                setBenchmarkReport(null);
              }}
              disabled={isRunningBenchmark}
              className={stylex.props(styles.input).className}
            >
              {Object.entries(BENCHMARK_METHODS).map(([method, config]) => (
                <option key={method} value={method}>
                  {config.label}
                </option>
              ))}
            </select>
          </label>
          <label {...stylex.props(styles.fieldLabel)}>
            RRF rank constant
            <select
              value={benchmarkRrfK}
              onChange={(event) => {
                setBenchmarkRrfK(Number(event.target.value) as RrfKOption);
                setBenchmarkReport(null);
              }}
              disabled={isRunningBenchmark || !BENCHMARK_METHODS[benchmarkMethod].usesRrf}
              className={stylex.props(styles.input, styles.disabledCursor).className}
            >
              {RRF_K_OPTIONS.map((rrfK) => (
                <option key={rrfK} value={rrfK}>
                  k = {rrfK}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div {...stylex.props(styles.profileCard)}>
          <div {...stylex.props(styles.wrapBetween)}>
            <p {...stylex.props(styles.headingSmall)}>
              {benchmarkProfile.label} · {benchmarkProfile.datasetIds.length} dataset
              {benchmarkProfile.datasetIds.length === 1 ? "" : "s"}
            </p>
            <a
              href="https://huggingface.co/datasets/sentence-transformers/NanoBEIR-en"
              target="_blank"
              rel="noreferrer"
              className={stylex.props(styles.link).className}
            >
              Public dataset source
            </a>
          </div>
          <p {...stylex.props(styles.body12)}>
            {benchmarkTotals.queryCount.toLocaleString()} queries ·{" "}
            {benchmarkTotals.corpusCount.toLocaleString()} corpus passages ·{" "}
            {benchmarkTotals.qrelCount.toLocaleString()} qrels · revision{" "}
            <span {...stylex.props(styles.mono)}>{NANO_BEIR_REVISION.slice(0, 8)}</span>
          </p>
          <div {...stylex.props(styles.datasetList)}>
            {benchmarkProfile.datasetIds.map((datasetId) => {
              const dataset = NANO_BEIR_DATASETS[datasetId];
              return (
                <span
                  key={datasetId}
                  title={`${dataset.domain} · ${dataset.queryCount} queries · ${dataset.corpusCount} passages · ${dataset.qrelCount} qrels`}
                  className={stylex.props(styles.dataset).className}
                >
                  {dataset.label} · {dataset.domain}
                </span>
              );
            })}
          </div>
        </div>

        <div {...stylex.props(styles.examples)}>
          <div {...stylex.props(styles.rowBetween)}>
            <p {...stylex.props(styles.indexTitle)}>Public query examples</p>
            <span {...stylex.props(styles.soft12)}>
              {isLoadingBenchmarkPreview
                ? "Loading…"
                : `${benchmarkPreview.reduce((total, dataset) => total + dataset.queries.length, 0)} loaded`}
            </span>
          </div>
          {benchmarkQuerySamples.length ? (
            <div {...stylex.props(styles.sampleGrid)}>
              {benchmarkQuerySamples.map((sample) => (
                <div key={sample.id} {...stylex.props(styles.sample)}>
                  <span {...stylex.props(styles.sampleDataset)}>{sample.datasetLabel}</span>
                  <span {...stylex.props(styles.separator)}>·</span>
                  {sample.text}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {benchmarkProgress ? (
          <p {...stylex.props(styles.benchmarkProgress)}>{benchmarkProgress}</p>
        ) : null}
        {benchmarkError ? (
          <p {...stylex.props(styles.warning)}>
            <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
            {benchmarkError}
          </p>
        ) : null}

        {benchmarkReport ? (
          <div {...stylex.props(styles.report)}>
            <div {...stylex.props(styles.scoreGrid)}>
              {[
                ["MRR@10", benchmarkReport.mrr],
                ["Recall@10", benchmarkReport.recallAt10],
                ["HitRate@10", benchmarkReport.hitRate],
                ["nDCG@10", benchmarkReport.ndcgAt10],
              ].map(([label, value]) => (
                <div key={String(label)} {...stylex.props(styles.score)}>
                  <p {...stylex.props(styles.scoreLabel)}>{label}</p>
                  <p {...stylex.props(styles.scoreValue)}>{Number(value).toFixed(3)}</p>
                </div>
              ))}
            </div>
            <p {...stylex.props(styles.reportMeta)}>
              {benchmarkReport.evaluatedCaseCount} evaluated · {benchmarkReport.skippedCaseCount}{" "}
              skipped · {BENCHMARK_METHODS[benchmarkReport.method].label}
              {benchmarkReport.rrfK ? ` · k=${benchmarkReport.rrfK}` : ""} ·{" "}
              {formatElapsed(benchmarkReport.durationMs)} total
            </p>
            <p {...stylex.props(styles.reportDetail)}>
              OPFS index: {benchmarkReport.indexSync.reusedDocumentCount} dataset documents reused ·{" "}
              {benchmarkReport.indexSync.indexedDocumentCount} written ·{" "}
              {benchmarkReport.indexSync.embeddedChunkCount.toLocaleString()} passages embedded ·{" "}
              {benchmarkReport.indexSync.resumedChunkCount.toLocaleString()} resumed from OPFS
            </p>

            <div {...stylex.props(styles.tableWrap)}>
              <table {...stylex.props(styles.table)}>
                <thead {...stylex.props(styles.tableHead)}>
                  <tr>
                    <th {...stylex.props(styles.thWide)}>Dataset</th>
                    <th {...stylex.props(styles.th)}>Queries</th>
                    <th {...stylex.props(styles.th)}>MRR@10</th>
                    <th {...stylex.props(styles.th)}>Recall@10</th>
                    <th {...stylex.props(styles.th)}>HitRate@10</th>
                    <th {...stylex.props(styles.thWide, styles.alignRight)}>nDCG@10</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkDatasetReports.map(({ definition, report }) => (
                    <tr key={definition.id} {...stylex.props(styles.tableRow)}>
                      <td {...stylex.props(styles.tdWide)}>
                        <span {...stylex.props(styles.headingSmall)}>{definition.label}</span>
                        <span {...stylex.props(styles.datasetDomain)}>{definition.domain}</span>
                      </td>
                      <td {...stylex.props(styles.td, styles.numeric)}>
                        {report.evaluatedCaseCount}
                      </td>
                      <td {...stylex.props(styles.td, styles.numeric)}>{report.mrr.toFixed(3)}</td>
                      <td {...stylex.props(styles.td, styles.numeric)}>
                        {report.recallAt10.toFixed(3)}
                      </td>
                      <td {...stylex.props(styles.td, styles.numeric)}>
                        {report.hitRate.toFixed(3)}
                      </td>
                      <td {...stylex.props(styles.tdWide, styles.numeric, styles.alignRight)}>
                        {report.ndcgAt10.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details {...stylex.props(styles.details)}>
              <summary {...stylex.props(styles.summary)}>
                Inspect all {benchmarkReport.cases.length} query results
              </summary>
              <div {...stylex.props(styles.detailsScroll)}>
                <table {...stylex.props(styles.table, styles.detailTable)}>
                  <thead {...stylex.props(styles.tableHead, styles.stickyHead)}>
                    <tr>
                      <th {...stylex.props(styles.thWide)}>Dataset</th>
                      <th {...stylex.props(styles.th)}>Public query</th>
                      <th {...stylex.props(styles.th)}>Qrels</th>
                      <th {...stylex.props(styles.th)}>First relevant</th>
                      <th {...stylex.props(styles.th)}>nDCG@10</th>
                      <th {...stylex.props(styles.thWide, styles.alignRight)}>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkReport.cases.map((item) => (
                      <tr key={item.id} {...stylex.props(styles.tableRow)}>
                        <td {...stylex.props(styles.tdWide, styles.numeric)}>
                          {NANO_BEIR_DATASETS[item.datasetId as NanoBeirDatasetId]?.label ??
                            item.datasetId}
                        </td>
                        <td {...stylex.props(styles.td, styles.query)}>{item.query}</td>
                        <td {...stylex.props(styles.td, styles.numeric)}>{item.relevantCount}</td>
                        <td {...stylex.props(styles.td, styles.numeric)}>
                          {item.firstRelevantRank ? `#${item.firstRelevantRank}` : "—"}
                        </td>
                        <td {...stylex.props(styles.td, styles.numeric)}>
                          {item.ndcgAt10.toFixed(3)}
                        </td>
                        <td {...stylex.props(styles.tdWide, styles.numeric, styles.alignRight)}>
                          {formatElapsed(item.latencyMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        ) : (
          <p {...stylex.props(styles.emptyBenchmark)}>
            The first run downloads the selected public corpus and writes its vectors into the
            existing OPFS index. Later runs with the same dataset revision, model, and index
            configuration reuse those vectors and only embed the queries.
          </p>
        )}
      </section>
    </div>
  );
}
