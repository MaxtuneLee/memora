import { Button } from "@base-ui/react/button";
import { useStore } from "@livestore/react";
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
const BGE_SMALL_EN_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

const getEmbeddingCacheKey = (
  model: BgeEmbeddingModel,
  chunk: ReturnType<typeof buildGroundedChunks>[number],
): string => {
  return `${model}:${chunk.sourceId}:${chunk.timestamp[0]}:${chunk.timestamp[1]}:${chunk.text}`;
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
  const { store } = useStore();
  const settings = store.useQuery(settingsDocumentQuery$) as setting;
  const providers = store.useQuery(chatProvidersQuery$) as ProviderRow[];
  const files = store.useQuery(chatActiveFilesQuery$) as LiveStoreFile[];
  const transcriptFiles = useMemo(() => files.filter(isTranscriptFile), [files]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [chunkSize, setChunkSize] = useState(420);
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
  const [bgeModel, setBgeModel] = useState<BgeEmbeddingModel>("bge-small-en");
  const [bgeBackend, setBgeBackend] = useState<BgeExecutionBackend | null>(null);
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

  useEffect(() => {
    if (hasInitializedTranscriptSelectionRef.current || !transcriptFiles.length) return;
    setSelectedIds(transcriptFiles.map((file) => file.id));
    hasInitializedTranscriptSelectionRef.current = true;
  }, [transcriptFiles]);

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
      const sources = await Promise.all(
        selectedFiles.map(async (file): Promise<GroundedTranscriptSource | null> => {
          const words = parseWords(await cat(file.transcriptPath));
          return words.length ? { id: file.id, name: file.name, words } : null;
        }),
      );
      const usableSources = sources.flatMap((source) => (source ? [source] : []));
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
  }, [chunkSize, contextBudget, question, reset, selectedFiles, topK]);

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
      const missingChunks = preparedChunks.filter((chunk) => {
        return !bgeEmbeddingCacheRef.current.has(getEmbeddingCacheKey(bgeModel, chunk));
      });
      const batchSize = 12;
      for (let start = 0; start < missingChunks.length; start += batchSize) {
        const batch = missingChunks.slice(start, start + batchSize);
        setBgeProgress(
          `Indexing ${Math.min(start + batch.length, missingChunks.length)} new chunks of ${missingChunks.length}`,
        );
        const vectors = await bgeEmbeddingClient.embed(
          bgeModel,
          batch.map((chunk) => chunk.text),
        );
        batch.forEach((chunk, index) => {
          const vector = vectors[index];
          if (vector)
            bgeEmbeddingCacheRef.current.set(getEmbeddingCacheKey(bgeModel, chunk), vector);
        });
      }
      const semanticChunks = preparedChunks
        .map((chunk) => ({
          ...chunk,
          score: queryEmbedding.reduce((total, value, dimension) => {
            const embedding = bgeEmbeddingCacheRef.current.get(
              getEmbeddingCacheKey(bgeModel, chunk),
            );
            return total + value * (embedding?.[dimension] ?? 0);
          }, 0),
        }))
        .sort((left, right) => right.score - left.score);
      const nextPack = buildContextPack(semanticChunks, topK, contextBudget, true);
      if (!nextPack.chunks.length) {
        setBgeError(
          "The BGE results exceed the current context budget. Increase the budget or reduce the chunk size.",
        );
        return;
      }
      setBgePack(nextPack);
      setBgeElapsedMs(performance.now() - startedAt);
      setActiveMethod("bge");
      await reset({ messages: [] });
    } catch (reason) {
      setBgeError(reason instanceof Error ? reason.message : "Unable to run BGE locally.");
    } finally {
      setBgeProgress(null);
      setIsRunningBge(false);
    }
  }, [bgeModel, contextBudget, preparedChunks, question, reset, topK]);

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
          <Button
            onClick={() => void runBgeComparison()}
            disabled={!preparedChunks.length || isRunningBge}
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
                      <span>
                        {formatTimestamp(chunk.timestamp[0])}–{formatTimestamp(chunk.timestamp[1])}
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
    </div>
  );
}
