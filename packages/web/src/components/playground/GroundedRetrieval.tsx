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
import { Streamdown } from "streamdown";
import { modelWorkerFactory } from "@/lib/model-worker";
import type { provider as ProviderRow } from "@/livestore/provider";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { setting } from "@/livestore/setting";
import { useAgent } from "@/hooks/chat/useAgent";
import { useChatModelConfig } from "@/components/chat/chatPage/useChatModelConfig";
import { chatActiveFilesQuery$, chatProvidersQuery$ } from "@/lib/chat/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
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

const PRIMARY_BUTTON_CLASS_NAME =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-memora-text px-4 text-sm font-medium text-memora-surface transition-colors hover:bg-memora-text-strong disabled:cursor-not-allowed disabled:opacity-45";
const SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-memora-border bg-memora-surface px-4 text-sm font-medium text-memora-text transition-colors hover:bg-memora-surface-soft disabled:cursor-not-allowed disabled:opacity-45";
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
    <div className="space-y-7">
      <div className="grid gap-7 xl:grid-cols-[minmax(320px,0.83fr)_minmax(0,1.35fr)]">
        <section className="rounded-[26px] border border-memora-border bg-memora-surface p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-memora-olive-faint text-memora-olive">
              <BrainIcon className="size-4" />
            </span>
            <div>
              <h2 className="font-serif text-xl font-medium tracking-tight text-memora-text-strong">
                Prepare local context
              </h2>
              <p className="mt-1 text-sm leading-6 text-memora-text-muted">
                Choose saved transcripts, then inspect exactly what the configured model can
                receive.
              </p>
            </div>
          </div>

          <label
            className="mt-6 block text-sm font-medium text-memora-text"
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
            className="mt-2 min-h-24 w-full resize-y rounded-xl border border-memora-border bg-memora-canvas px-3 py-2.5 text-sm leading-6 text-memora-text outline-none placeholder:text-memora-text-soft focus:border-memora-olive focus:ring-2 focus:ring-memora-olive-soft"
          />

          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-memora-text">Local transcripts</p>
            <span className="text-xs text-memora-text-soft">{selectedIds.length} selected</span>
          </div>
          <div className="mt-2 max-h-52 space-y-1 overflow-auto rounded-xl border border-memora-border bg-memora-canvas p-1.5">
            {transcriptFiles.length ? (
              transcriptFiles.map((file) => {
                const checked = selectedIds.includes(file.id);
                return (
                  <label
                    key={file.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-memora-surface-soft"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFile(file.id)}
                      className="size-4 rounded border-memora-border text-memora-olive focus:ring-memora-olive-soft"
                    />
                    <span className="min-w-0 flex-1 truncate text-memora-text">{file.name}</span>
                    <span className="shrink-0 text-xs text-memora-text-soft">{file.type}</span>
                  </label>
                );
              })
            ) : (
              <p className="px-3 py-5 text-sm leading-6 text-memora-text-muted">
                No saved audio or video transcripts are available yet.
              </p>
            )}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-medium text-memora-text-muted">
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
                className="mt-1.5 h-10 w-full rounded-lg border border-memora-border bg-memora-canvas px-2.5 text-sm text-memora-text outline-none focus:border-memora-olive"
              />
            </label>
            <label className="block text-xs font-medium text-memora-text-muted">
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
                className="mt-1.5 h-10 w-full rounded-lg border border-memora-border bg-memora-canvas px-2.5 text-sm text-memora-text outline-none focus:border-memora-olive"
              />
            </label>
            <label className="block text-xs font-medium text-memora-text-muted">
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
                className="mt-1.5 h-10 w-full rounded-lg border border-memora-border bg-memora-canvas px-2.5 text-sm text-memora-text outline-none focus:border-memora-olive"
              />
            </label>
          </div>
          <p className="mt-2 text-xs leading-5 text-memora-text-soft">
            All limits are characters for this experiment. The 420-character default stays within
            the BGE small EN input limit and is also valid for BGE-M3.
          </p>
          {prepareError ? (
            <p className="mt-4 flex gap-2 rounded-xl bg-memora-warning-surface px-3 py-2 text-sm leading-5 text-memora-warning-text">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              {prepareError}
            </p>
          ) : null}
          <Button
            onClick={() => void prepareContext()}
            disabled={isPreparing}
            className={`${PRIMARY_BUTTON_CLASS_NAME} mt-6 w-full`}
          >
            {isPreparing ? "Preparing context…" : "Prepare context"}
            <CaretRightIcon className="size-4" />
          </Button>
          <label className="mt-5 block text-xs font-medium text-memora-text-muted">
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
              className="mt-1.5 h-10 w-full rounded-lg border border-memora-border bg-memora-canvas px-2.5 text-sm text-memora-text outline-none focus:border-memora-olive"
            >
              {Object.entries(BGE_MODELS).map(([id, model]) => (
                <option key={id} value={id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-memora-text-soft">
            {BGE_MODELS[bgeModel].description}
          </p>
          <span className="mt-3 inline-flex rounded-full border border-memora-border bg-memora-surface-soft px-2.5 py-1 text-xs font-medium text-memora-text-muted">
            Backend:{" "}
            {bgeBackend === "webgpu" ? "WebGPU" : bgeBackend === "wasm" ? "WASM" : "Not loaded"}
          </span>
          <div className="mt-4 rounded-xl border border-memora-border-soft bg-memora-canvas px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-memora-text">Persistent local index</p>
              <span className="text-xs text-memora-text-soft">
                {indexHealth?.persistent ? "OPFS" : indexHealth ? "SQLite" : "Not initialized"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-memora-text-muted">
              {indexHealth
                ? `${indexHealth.documentCount} documents · ${indexHealth.chunkCount} chunks · ${indexHealth.sqliteVecVersion}`
                : "Run semantic retrieval to initialize the SQLite + sqlite-vec database."}
            </p>
            {indexHealth ? (
              <p className="mt-1 truncate font-mono text-[11px] text-memora-text-soft">
                indexId {indexHealth.indexId}
              </p>
            ) : null}
            {lastIndexSync ? (
              <p className="mt-2 text-xs leading-5 text-memora-text-muted">
                Last sync: {lastIndexSync.reusedDocumentCount} reused ·{" "}
                {lastIndexSync.indexedDocumentCount} written · {lastIndexSync.embeddedChunkCount}{" "}
                embedded · {lastIndexSync.resumedChunkCount} resumed from OPFS
              </p>
            ) : null}
          </div>
          {indexError ? (
            <p className="mt-3 flex gap-2 rounded-xl bg-memora-warning-surface px-3 py-2 text-sm leading-5 text-memora-warning-text">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              {indexError}
            </p>
          ) : null}
          <Button
            onClick={() => void runBgeComparison()}
            disabled={!preparedChunks.length || isRunningBge || isRunningBenchmark}
            className={`${SECONDARY_BUTTON_CLASS_NAME} mt-3 w-full`}
          >
            {isRunningBge ? "Running semantic retrieval…" : `Run ${BGE_MODELS[bgeModel].label}`}
          </Button>
          {bgeProgress ? (
            <p className="mt-3 text-xs leading-5 text-memora-text-muted">{bgeProgress}</p>
          ) : null}
          {bgeError ? (
            <p className="mt-3 flex gap-2 rounded-xl bg-memora-warning-surface px-3 py-2 text-sm leading-5 text-memora-warning-text">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              {bgeError}
            </p>
          ) : null}
        </section>

        <section className="min-w-0 rounded-[26px] border border-memora-border bg-memora-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-memora-border pb-5">
            <div>
              <h2 className="font-serif text-xl font-medium tracking-tight text-memora-text-strong">
                Model boundary
              </h2>
              <p className="mt-1 text-sm leading-6 text-memora-text-muted">
                The blocks below are the whole remote context for this run.
              </p>
            </div>
            {contextPack ? (
              <span className="rounded-full border border-memora-border bg-memora-surface-soft px-2.5 py-1 text-xs font-medium text-memora-text-muted">
                {contextPack.characterCount.toLocaleString()} / {contextBudget.toLocaleString()}{" "}
                chars
              </span>
            ) : null}
          </div>
          {keywordPack ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveMethod("keyword")}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${activeMethod === "keyword" ? "bg-memora-olive-faint text-memora-olive" : "text-memora-text-muted hover:bg-memora-surface-soft"}`}
              >
                Keyword baseline · {formatElapsed(keywordElapsedMs)}
              </button>
              <button
                type="button"
                onClick={() => bgePack && setActiveMethod("bge")}
                disabled={!bgePack}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${activeMethod === "bge" ? "bg-memora-olive-faint text-memora-olive" : "text-memora-text-muted hover:bg-memora-surface-soft"} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {BGE_MODELS[bgeModel].label} · {formatElapsed(bgeElapsedMs)}
              </button>
              <span className="text-xs text-memora-text-soft">
                Semantic retrieval runs locally in a worker.
              </span>
            </div>
          ) : null}
          {contextPack ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-memora-text-muted">
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
              <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                {contextPack.chunks.map((chunk) => (
                  <article
                    key={chunk.id}
                    className="rounded-xl border border-memora-border-soft bg-memora-canvas px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-memora-text-muted">
                      <span className="font-medium text-memora-text">{chunk.sourceName}</span>
                      <span className="flex flex-wrap items-center justify-end gap-2">
                        {chunk.cosineSimilarity !== undefined &&
                        chunk.vectorDistance !== undefined ? (
                          <span
                            className="rounded-md border border-memora-border-soft bg-memora-surface px-2 py-0.5 font-mono text-[11px] text-memora-text-soft"
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
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-memora-text">
                      {chunk.text}
                    </p>
                  </article>
                ))}
              </div>
              <div className="mt-5 border-t border-memora-border pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-memora-text">Configured chat model</p>
                    <p className="mt-1 text-xs text-memora-text-soft">
                      {isConfigured
                        ? (selectedModelInfo?.name ?? "Selected model")
                        : "Choose a provider and model in Settings first."}
                    </p>
                  </div>
                  {isStreaming ? (
                    <Button onClick={abort} className={SECONDARY_BUTTON_CLASS_NAME}>
                      Stop
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void runModel()}
                      disabled={!isConfigured}
                      className={PRIMARY_BUTTON_CLASS_NAME}
                    >
                      <PlayIcon className="size-4" />
                      Ask model
                    </Button>
                  )}
                </div>
                {agentError ? (
                  <p className="mt-3 rounded-xl bg-memora-warning-surface px-3 py-2 text-sm text-memora-warning-text">
                    {agentError.message}
                  </p>
                ) : null}
                {answer ? (
                  <div className="mt-5 border-t border-memora-border pt-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-memora-text">
                      <CheckCircleIcon className="size-4 text-memora-olive" />
                      Model response
                    </div>
                    <Streamdown
                      className={`${MEMORA_STREAMDOWN_CLASS_NAME} mt-3`}
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
            <div className="flex min-h-[420px] items-center justify-center text-center">
              <div className="max-w-sm">
                <p className="font-serif text-xl font-medium text-memora-text-strong">
                  Nothing is selected for remote use.
                </p>
                <p className="mt-2 text-sm leading-6 text-memora-text-muted">
                  Prepare a query to inspect the retrieved chunks before calling the model.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-[26px] border border-memora-border bg-memora-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-serif text-xl font-medium tracking-tight text-memora-text-strong">
              NanoBEIR retrieval benchmark
            </h2>
            <p className="mt-1 text-sm leading-6 text-memora-text-muted">
              Runs public queries and qrels from NanoBEIR-en against the same SQLite + sqlite-vec
              OPFS index used by transcript retrieval.
            </p>
          </div>
          <Button
            onClick={() => void runRetrievalBenchmark()}
            disabled={isRunningBenchmark || isRunningBge || isLoadingBenchmarkPreview}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            {isRunningBenchmark ? "Running benchmark…" : "Run retrieval benchmark"}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)_minmax(180px,0.3fr)]">
          <label className="block text-xs font-medium text-memora-text-muted">
            Evaluation profile
            <select
              value={benchmarkProfileId}
              onChange={(event) => {
                setBenchmarkProfileId(event.target.value as NanoBeirProfileId);
                setBenchmarkReport(null);
                setBenchmarkPreview([]);
              }}
              disabled={isRunningBenchmark}
              className="mt-1.5 h-10 w-full rounded-lg border border-memora-border bg-memora-canvas px-2.5 text-sm text-memora-text outline-none focus:border-memora-olive disabled:opacity-50"
            >
              {Object.values(NANO_BEIR_PROFILES).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label} — {profile.description}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-memora-text-muted">
            Retrieval method
            <select
              value={benchmarkMethod}
              onChange={(event) => {
                setBenchmarkMethod(event.target.value as BenchmarkRetrievalMethod);
                setBenchmarkReport(null);
              }}
              disabled={isRunningBenchmark}
              className="mt-1.5 h-10 w-full rounded-lg border border-memora-border bg-memora-canvas px-2.5 text-sm text-memora-text outline-none focus:border-memora-olive disabled:opacity-50"
            >
              {Object.entries(BENCHMARK_METHODS).map(([method, config]) => (
                <option key={method} value={method}>
                  {config.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-memora-text-muted">
            RRF rank constant
            <select
              value={benchmarkRrfK}
              onChange={(event) => {
                setBenchmarkRrfK(Number(event.target.value) as RrfKOption);
                setBenchmarkReport(null);
              }}
              disabled={isRunningBenchmark || !BENCHMARK_METHODS[benchmarkMethod].usesRrf}
              className="mt-1.5 h-10 w-full rounded-lg border border-memora-border bg-memora-canvas px-2.5 text-sm text-memora-text outline-none focus:border-memora-olive disabled:cursor-not-allowed disabled:opacity-50"
            >
              {RRF_K_OPTIONS.map((rrfK) => (
                <option key={rrfK} value={rrfK}>
                  k = {rrfK}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-memora-border-soft bg-memora-canvas px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-memora-text">
              {benchmarkProfile.label} · {benchmarkProfile.datasetIds.length} dataset
              {benchmarkProfile.datasetIds.length === 1 ? "" : "s"}
            </p>
            <a
              href="https://huggingface.co/datasets/sentence-transformers/NanoBEIR-en"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-memora-olive hover:underline"
            >
              Public dataset source
            </a>
          </div>
          <p className="mt-1 text-xs leading-5 text-memora-text-muted">
            {benchmarkTotals.queryCount.toLocaleString()} queries ·{" "}
            {benchmarkTotals.corpusCount.toLocaleString()} corpus passages ·{" "}
            {benchmarkTotals.qrelCount.toLocaleString()} qrels · revision{" "}
            <span className="font-mono">{NANO_BEIR_REVISION.slice(0, 8)}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {benchmarkProfile.datasetIds.map((datasetId) => {
              const dataset = NANO_BEIR_DATASETS[datasetId];
              return (
                <span
                  key={datasetId}
                  title={`${dataset.domain} · ${dataset.queryCount} queries · ${dataset.corpusCount} passages · ${dataset.qrelCount} qrels`}
                  className="rounded-full border border-memora-border bg-memora-surface px-2.5 py-1 text-xs text-memora-text-muted"
                >
                  {dataset.label} · {dataset.domain}
                </span>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-memora-text">Public query examples</p>
            <span className="text-xs text-memora-text-soft">
              {isLoadingBenchmarkPreview
                ? "Loading…"
                : `${benchmarkPreview.reduce((total, dataset) => total + dataset.queries.length, 0)} loaded`}
            </span>
          </div>
          {benchmarkQuerySamples.length ? (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {benchmarkQuerySamples.map((sample) => (
                <div
                  key={sample.id}
                  className="rounded-lg border border-memora-border-soft px-3 py-2 text-xs leading-5 text-memora-text-muted"
                >
                  <span className="font-medium text-memora-text">{sample.datasetLabel}</span>
                  <span className="mx-1.5 text-memora-text-soft">·</span>
                  {sample.text}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {benchmarkProgress ? (
          <p className="mt-4 rounded-lg bg-memora-olive-faint px-3 py-2 text-sm text-memora-text-muted">
            {benchmarkProgress}
          </p>
        ) : null}
        {benchmarkError ? (
          <p className="mt-4 flex gap-2 rounded-xl bg-memora-warning-surface px-3 py-2 text-sm leading-5 text-memora-warning-text">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            {benchmarkError}
          </p>
        ) : null}

        {benchmarkReport ? (
          <div className="mt-5">
            <div className="grid overflow-hidden rounded-xl border border-memora-border-soft bg-memora-canvas sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-memora-border-soft">
              {[
                ["MRR@10", benchmarkReport.mrr],
                ["Recall@10", benchmarkReport.recallAt10],
                ["HitRate@10", benchmarkReport.hitRate],
                ["nDCG@10", benchmarkReport.ndcgAt10],
              ].map(([label, value]) => (
                <div key={String(label)} className="px-4 py-3">
                  <p className="text-xs font-medium text-memora-text-muted">{label}</p>
                  <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-memora-text-strong">
                    {Number(value).toFixed(3)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-memora-text-soft">
              {benchmarkReport.evaluatedCaseCount} evaluated · {benchmarkReport.skippedCaseCount}{" "}
              skipped · {BENCHMARK_METHODS[benchmarkReport.method].label}
              {benchmarkReport.rrfK ? ` · k=${benchmarkReport.rrfK}` : ""} ·{" "}
              {formatElapsed(benchmarkReport.durationMs)} total
            </p>
            <p className="mt-1 text-xs leading-5 text-memora-text-muted">
              OPFS index: {benchmarkReport.indexSync.reusedDocumentCount} dataset documents reused ·{" "}
              {benchmarkReport.indexSync.indexedDocumentCount} written ·{" "}
              {benchmarkReport.indexSync.embeddedChunkCount.toLocaleString()} passages embedded ·{" "}
              {benchmarkReport.indexSync.resumedChunkCount.toLocaleString()} resumed from OPFS
            </p>

            <div className="mt-4 overflow-x-auto rounded-xl border border-memora-border-soft">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-memora-canvas text-xs text-memora-text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Dataset</th>
                    <th className="px-3 py-2.5 font-medium">Queries</th>
                    <th className="px-3 py-2.5 font-medium">MRR@10</th>
                    <th className="px-3 py-2.5 font-medium">Recall@10</th>
                    <th className="px-3 py-2.5 font-medium">HitRate@10</th>
                    <th className="px-4 py-2.5 text-right font-medium">nDCG@10</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-memora-border-soft">
                  {benchmarkDatasetReports.map(({ definition, report }) => (
                    <tr key={definition.id} className="text-memora-text">
                      <td className="px-4 py-3">
                        <span className="font-medium">{definition.label}</span>
                        <span className="ml-2 text-xs text-memora-text-soft">
                          {definition.domain}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs tabular-nums text-memora-text-muted">
                        {report.evaluatedCaseCount}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs tabular-nums text-memora-text-muted">
                        {report.mrr.toFixed(3)}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs tabular-nums text-memora-text-muted">
                        {report.recallAt10.toFixed(3)}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs tabular-nums text-memora-text-muted">
                        {report.hitRate.toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-memora-text-muted">
                        {report.ndcgAt10.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="mt-4 rounded-xl border border-memora-border-soft">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-memora-text">
                Inspect all {benchmarkReport.cases.length} query results
              </summary>
              <div className="max-h-[560px] overflow-auto border-t border-memora-border-soft">
                <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-memora-canvas text-xs text-memora-text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Dataset</th>
                      <th className="px-3 py-2.5 font-medium">Public query</th>
                      <th className="px-3 py-2.5 font-medium">Qrels</th>
                      <th className="px-3 py-2.5 font-medium">First relevant</th>
                      <th className="px-3 py-2.5 font-medium">nDCG@10</th>
                      <th className="px-4 py-2.5 text-right font-medium">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-memora-border-soft">
                    {benchmarkReport.cases.map((item) => (
                      <tr key={item.id} className="text-memora-text">
                        <td className="px-4 py-3 text-xs text-memora-text-muted">
                          {NANO_BEIR_DATASETS[item.datasetId as NanoBeirDatasetId]?.label ??
                            item.datasetId}
                        </td>
                        <td className="max-w-xl px-3 py-3 leading-5">{item.query}</td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums text-memora-text-muted">
                          {item.relevantCount}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums text-memora-text-muted">
                          {item.firstRelevantRank ? `#${item.firstRelevantRank}` : "—"}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums text-memora-text-muted">
                          {item.ndcgAt10.toFixed(3)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-memora-text-muted">
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
          <p className="mt-5 rounded-xl border border-dashed border-memora-border bg-memora-canvas px-4 py-5 text-sm leading-6 text-memora-text-muted">
            The first run downloads the selected public corpus and writes its vectors into the
            existing OPFS index. Later runs with the same dataset revision, model, and index
            configuration reuse those vectors and only embed the queries.
          </p>
        )}
      </section>
    </div>
  );
}
