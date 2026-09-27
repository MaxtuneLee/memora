import {
  createJevJudge,
  listAgentEvaluationResults,
  readAgentEvaluationResult,
  saveAgentEvaluationResult,
  type AgentAttemptResult,
  type AgentEvaluationResult,
  type EvaluationQuestion,
  type SavedAgentEvaluationSummary,
} from "@memora/evaluation";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { useChatModelConfig } from "@/components/chat/chatPage/useChatModelConfig";
import { chatProvidersQuery$ } from "@/lib/chat/queries";
import { createChatTools } from "@/lib/chat/tools";
import { readTrace } from "@/lib/agent-runtime/client";
import { createWebAgentAdapter } from "@/lib/playground/agentEvaluationAdapter";
import { evaluationClient } from "@/lib/playground/evaluationClient";
import {
  importEvaluationLectures,
  parseEvaluationImport,
  type EvaluationImport,
} from "@/lib/playground/evaluationImport";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import type { provider as ProviderRow } from "@/livestore/provider";
import {
  providerCredentialEvents,
  providerCredentialsQuery$,
  readProviderApiKey,
} from "@/livestore/providerCredential";
import type { setting } from "@/livestore/setting";
import { useAppStore } from "@/livestore/store";
import { tokens } from "../../styles/stylex.stylex";

import { AgentAttemptList, AgentEvaluationSummaryView } from "./AgentEvaluationResults";

const styles = stylex.create({
  section: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    padding: "1.5rem",
  },
  title: {
    color: tokens.textStrong,
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.125rem",
    fontWeight: 500,
    lineHeight: "1.75rem",
  },
  description: { color: tokens.textMuted, fontSize: "0.875rem", lineHeight: "1.25rem" },
  field: {
    color: tokens.text,
    display: "flex",
    flexDirection: "column",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.375rem",
  },
  input: { color: tokens.textMuted, fontWeight: 400 },
  number: {
    borderColor: tokens.border,
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    fontWeight: 400,
    padding: "0.25rem 0.5rem",
    width: "5rem",
  },
  key: { width: "20rem", maxWidth: "100%" },
  actions: { display: "flex", gap: "0.5rem" },
  button: {
    alignSelf: "flex-start",
    backgroundColor: tokens.primaryBackground,
    borderRadius: "0.75rem",
    color: tokens.primaryText,
    fontSize: "0.875rem",
    fontWeight: 500,
    height: "2.5rem",
    opacity: { default: 1, ":disabled": 0.5 },
    paddingInline: "1rem",
  },
  error: {
    backgroundColor: tokens.dangerSurface,
    borderColor: tokens.dangerBorder,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.dangerText,
    fontSize: "0.875rem",
    padding: "0.75rem 1rem",
    whiteSpace: "pre-wrap",
  },
  summary: { color: tokens.text, fontSize: "0.875rem", lineHeight: "1.25rem" },
  history: { display: "flex", flexDirection: "column" },
  historyRow: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": tokens.hover },
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: tokens.text,
    display: "flex",
    fontSize: "0.875rem",
    gap: "1rem",
    justifyContent: "space-between",
    paddingBlock: "0.625rem",
    paddingInline: "0.5rem",
    textAlign: "left",
    width: "100%",
  },
  historyRowSelected: { backgroundColor: tokens.selected },
  historyMeta: { color: tokens.textMuted, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" },
  pre: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "0.75rem",
    color: tokens.text,
    fontSize: "0.75rem",
    overflowX: "auto",
    padding: "1rem",
  },
});

// Stored like provider keys: device-local, never exported.
const TYPESAFE_CREDENTIAL = { id: "typesafe", baseUrl: "https://api.typesafe.ai" };
const ATTEMPTS_PER_QUESTION = 3;

type ImportState =
  | { status: "idle" }
  | { status: "importing" }
  | { status: "failed"; message: string }
  | { status: "imported"; data: EvaluationImport; created: number; existing: number };

/** Downloads the result with each attempt's Trace inlined, keyed by `<sessionId>/<runId>`. */
async function exportEvaluation(result: AgentEvaluationResult): Promise<void> {
  const traces: Record<string, unknown> = {};
  for (const attempt of result.attempts) {
    const trace = attempt.answer ?? attempt.trace;
    if (!trace?.runId) continue;
    // Traces exist only in development builds; a missing one is left out.
    traces[`${trace.sessionId}/${trace.runId}`] = await readTrace(
      trace.sessionId,
      trace.runId,
    ).catch(() => null);
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ ...result, traces }, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `agent-evaluation-${result.evaluationId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type RunState =
  | { status: "idle" }
  | {
      status: "running";
      completed: number;
      total: number;
      attempts: AgentAttemptResult[];
      questions: EvaluationQuestion[];
      fileLectures: Record<string, string>;
    }
  | { status: "failed"; message: string }
  | { status: "done"; result: AgentEvaluationResult; saveError?: string };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const historyLabel = (item: SavedAgentEvaluationSummary) => {
  const rate = item.completed ? ` (${Math.round((item.passed / item.completed) * 100)}%)` : "";
  const { input, cached, output } = item.tokens;
  const tokens = `${(input + cached + output).toLocaleString()} tokens`;
  return `${item.status === "canceled" ? "Canceled" : "Completed"} · ${item.passed} / ${item.completed} passed${rate} · ${tokens}`;
};

export default function AgentEvaluation() {
  const store = useAppStore();
  const [state, setState] = useState<ImportState>({ status: "idle" });

  const [dataFiles, setDataFiles] = useState<File[]>([]);
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [concurrency, setConcurrency] = useState(3);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const [history, setHistory] = useState<SavedAgentEvaluationSummary[]>([]);
  const [shown, setShown] = useState<AgentEvaluationResult>();
  const [exporting, setExporting] = useState(false);
  const [openError, setOpenError] = useState<string>();

  const openResult = async (evaluationId: string) => {
    setOpenError(undefined);
    try {
      setShown(await readAgentEvaluationResult(evaluationId));
    } catch (error) {
      setOpenError(errorMessage(error));
    }
  };

  // Opens the latest saved evaluation.
  useEffect(() => {
    let cancelled = false;
    void listAgentEvaluationResults().then(
      async (items) => {
        if (cancelled) return;
        setHistory(items);
        if (!items[0]) return;
        const latest = await readAgentEvaluationResult(items[0].evaluationId).catch(
          () => undefined,
        );
        if (!cancelled && latest) setShown((current) => current ?? latest);
      },
      (error: unknown) => setOpenError(errorMessage(error)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = store.useQuery(settingsDocumentQuery$) as setting;
  const providers = store.useQuery(chatProvidersQuery$) as ProviderRow[];
  const jevKey = readProviderApiKey(
    TYPESAFE_CREDENTIAL,
    store.useQuery(providerCredentialsQuery$),
  ).trim();
  const { agentConfig, providerConfig, compactionProviderConfig } = useChatModelConfig({
    providers,
    settings,
    activeSessionId: "evaluation",
  });

  const runEvaluation = async () => {
    if (state.status !== "imported" || !providerConfig || !jevKey) return;
    const { questions, lectures, fileLectures, cues, revisions } = state.data;
    const next = new AbortController();
    controller.current = next;
    setRun({
      status: "running",
      completed: 0,
      total: questions.length * ATTEMPTS_PER_QUESTION,
      attempts: [],
      questions,
      fileLectures,
    });
    try {
      const agent = await createWebAgentAdapter({
        provider: providerConfig,
        compactionProvider: compactionProviderConfig,
        config: agentConfig,
        tools: createChatTools(store),
      });
      const result = await evaluationClient.runAgent(
        {
          questions,
          corpus: {
            fileLectures,
            cues,
            revisions,
            lectureNames: Object.fromEntries(
              lectures.map(({ lectureId, name }) => [lectureId, name]),
            ),
          },
          agent,
          judge: createJevJudge({ apiKey: jevKey, baseUrl: "/api/playground/typesafe" }),
          concurrency,
        },
        {
          signal: next.signal,
          // Attempts show as they finish, not only at the end.
          onProgress: ({ completed, attempt }) =>
            setRun((current) =>
              current.status === "running"
                ? { ...current, completed, attempts: [...current.attempts, attempt] }
                : current,
            ),
        },
      );
      let saveError: string | undefined;
      try {
        await saveAgentEvaluationResult(result);
      } catch (error) {
        saveError = errorMessage(error);
      }
      setRun({ status: "done", result, saveError });
      setShown(result);
      void listAgentEvaluationResults().then(setHistory, () => {});
    } catch (error) {
      setRun({ status: "failed", message: errorMessage(error) });
    } finally {
      controller.current = undefined;
    }
  };

  const importFiles = async () => {
    if (!questionsFile) return;
    setState({ status: "importing" });
    try {
      const read = async (file: File) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      const data = await parseEvaluationImport(
        await Promise.all(dataFiles.map(read)),
        await read(questionsFile),
      );
      const { created, existing } = await importEvaluationLectures(data.lectures, store);
      setState({ status: "imported", data, created: created.length, existing: existing.length });
    } catch (error) {
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <section {...stylex.props(styles.section)}>
      <div>
        <h2 {...stylex.props(styles.title)}>Evaluation data</h2>
        <p {...stylex.props(styles.description)}>
          Each lecture becomes a transcript-only video in the library. Importing the same files
          again reuses the existing videos.
        </p>
      </div>
      <label {...stylex.props(styles.field)}>
        Converter output (manifest, transcripts, and cues)
        <input
          type="file"
          accept=".json,application/json"
          multiple
          className={stylex.props(styles.input).className}
          onChange={(event) => setDataFiles(Array.from(event.target.files ?? []))}
        />
      </label>
      <label {...stylex.props(styles.field)}>
        Questions file
        <input
          type="file"
          accept=".json,application/json"
          className={stylex.props(styles.input).className}
          onChange={(event) => setQuestionsFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <button
        type="button"
        disabled={state.status === "importing" || dataFiles.length === 0 || !questionsFile}
        onClick={() => void importFiles()}
        {...stylex.props(styles.button)}
      >
        {state.status === "importing" ? "Importing…" : "Import"}
      </button>
      {state.status === "failed" ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {state.message}
        </p>
      ) : null}
      {state.status === "imported" ? (
        <>
          <p {...stylex.props(styles.summary)}>
            {state.data.questions.length} questions, {state.data.lectures.length} lectures (
            {state.created} created, {state.existing} already in the library).
          </p>
          <pre {...stylex.props(styles.pre)}>
            {JSON.stringify(
              { fileLectures: state.data.fileLectures, revisions: state.data.revisions },
              null,
              2,
            )}
          </pre>
          <label {...stylex.props(styles.field)}>
            Attempts at once
            <input
              type="number"
              min={1}
              max={10}
              value={concurrency}
              disabled={run.status === "running"}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1) setConcurrency(value);
              }}
              {...stylex.props(styles.number)}
            />
          </label>
          <label {...stylex.props(styles.field)}>
            TypeSafe AI API key for the Jev judge
            <input
              type="password"
              autoComplete="off"
              value={jevKey}
              disabled={run.status === "running"}
              onChange={(event) =>
                store.commit(
                  providerCredentialEvents.providerCredentialSet({
                    providerId: TYPESAFE_CREDENTIAL.id,
                    baseUrl: TYPESAFE_CREDENTIAL.baseUrl,
                    apiKey: event.target.value,
                  }),
                )
              }
              {...stylex.props(styles.number, styles.key)}
            />
          </label>
          <div {...stylex.props(styles.actions)}>
            <button
              type="button"
              disabled={run.status === "running" || !providerConfig || !jevKey}
              onClick={() => void runEvaluation()}
              {...stylex.props(styles.button)}
            >
              {run.status === "running"
                ? `Running ${run.completed} of ${run.total}…`
                : "Run evaluation"}
            </button>
            {run.status === "running" ? (
              <button
                type="button"
                onClick={() => controller.current?.abort()}
                {...stylex.props(styles.button)}
              >
                Cancel
              </button>
            ) : null}
          </div>
          {providerConfig ? null : (
            <p {...stylex.props(styles.description)}>Choose a chat model in Settings first.</p>
          )}
        </>
      ) : null}
      {run.status === "failed" ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {run.message}
        </p>
      ) : null}
      {run.status === "done" && run.saveError ? (
        <p role="alert" {...stylex.props(styles.error)}>
          The result could not be saved: {run.saveError}
        </p>
      ) : null}
      {openError ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {openError}
        </p>
      ) : null}
      {run.status === "running" ? (
        <AgentAttemptList
          questions={run.questions}
          attempts={run.attempts}
          attemptsPerQuestion={ATTEMPTS_PER_QUESTION}
          fileLectures={run.fileLectures}
        />
      ) : shown ? (
        <>
          <div>
            <div {...stylex.props(styles.actions)}>
              <h2 {...stylex.props(styles.title)}>Results</h2>
              <button
                type="button"
                disabled={exporting}
                onClick={() => {
                  setExporting(true);
                  void exportEvaluation(shown)
                    .catch((error: unknown) =>
                      console.error("Could not export the evaluation:", error),
                    )
                    .finally(() => setExporting(false));
                }}
                {...stylex.props(styles.button)}
              >
                {exporting ? "Exporting…" : "Export JSON"}
              </button>
            </div>
            <p {...stylex.props(styles.description)}>
              {new Date(shown.startedAt).toLocaleString()} · {shown.agent.model} · judged by{" "}
              {shown.judge.model}
              {shown.status === "canceled" ? " · Canceled" : ""}
            </p>
          </div>
          <AgentEvaluationSummaryView result={shown} />
          <AgentAttemptList
            key={shown.evaluationId}
            questions={
              shown.questions ?? shown.summary.questions.map(({ questionId }) => ({ questionId }))
            }
            attempts={shown.attempts}
            attemptsPerQuestion={shown.config.attemptsPerQuestion}
            fileLectures={shown.fileLectures}
          />
        </>
      ) : null}
      {history.length ? (
        <div>
          <h2 {...stylex.props(styles.title)}>History</h2>
          <div {...stylex.props(styles.history)}>
            {history.map((item) => (
              <button
                key={item.evaluationId}
                type="button"
                aria-current={item.evaluationId === shown?.evaluationId}
                onClick={() => void openResult(item.evaluationId)}
                {...stylex.props(
                  styles.historyRow,
                  item.evaluationId === shown?.evaluationId && styles.historyRowSelected,
                )}
              >
                <span>
                  {new Date(item.startedAt).toLocaleString()} · {item.model}
                </span>
                <span {...stylex.props(styles.historyMeta)}>{historyLabel(item)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
