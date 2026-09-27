import {
  createJevJudge,
  saveAgentEvaluationResult,
  spotChecks,
  type AgentEvaluationResult,
} from "@memora/evaluation";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { useChatModelConfig } from "@/components/chat/chatPage/useChatModelConfig";
import { chatProvidersQuery$ } from "@/lib/chat/queries";
import { createChatTools } from "@/lib/chat/tools";
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
const SPOT_CHECKS_SHOWN = 10;

type ImportState =
  | { status: "idle" }
  | { status: "importing" }
  | { status: "failed"; message: string }
  | { status: "imported"; data: EvaluationImport; created: number; existing: number };

type RunState =
  | { status: "idle" }
  | { status: "running"; completed: number; total: number }
  | { status: "failed"; message: string }
  | { status: "done"; result: AgentEvaluationResult; saveError?: string };

export default function AgentEvaluation() {
  const store = useAppStore();
  const [state, setState] = useState<ImportState>({ status: "idle" });

  const [dataFiles, setDataFiles] = useState<File[]>([]);
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [concurrency, setConcurrency] = useState(3);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);

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
    const { questions, fileLectures, cues, revisions } = state.data;
    const next = new AbortController();
    controller.current = next;
    setRun({ status: "running", completed: 0, total: questions.length * 3 });
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
          corpus: { fileLectures, cues, revisions },
          agent,
          judge: createJevJudge({ apiKey: jevKey, baseUrl: "/api/playground/typesafe" }),
          concurrency,
        },
        {
          signal: next.signal,
          onProgress: ({ completed, total }) => setRun({ status: "running", completed, total }),
        },
      );
      let saveError: string | undefined;
      try {
        await saveAgentEvaluationResult(result);
      } catch (error) {
        saveError = error instanceof Error ? error.message : String(error);
      }
      setRun({ status: "done", result, saveError });
    } catch (error) {
      setRun({ status: "failed", message: error instanceof Error ? error.message : String(error) });
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
      {run.status === "done" ? (
        <>
          <p {...stylex.props(styles.summary)}>
            {run.result.status === "canceled" ? "Canceled. " : ""}
            {run.result.summary.passed} of {run.result.summary.plannedAttempts} attempts passed;
            retrieval passed {run.result.summary.retrievalPassed}, coverage passed{" "}
            {run.result.summary.coveragePassed}.{" "}
            {run.saveError
              ? `The result could not be saved: ${run.saveError}`
              : `Saved as ${run.result.evaluationId}.`}
          </p>
          <div>
            <h3 {...stylex.props(styles.field)}>Review these first</h3>
            <ol {...stylex.props(styles.summary)}>
              {spotChecks(run.result)
                .slice(0, SPOT_CHECKS_SHOWN)
                .map((check) => (
                  <li key={`${check.questionId}-${check.attempt}`}>
                    {check.questionId} attempt {check.attempt}: retrieval{" "}
                    {check.retrievalPassed ? "passed" : "failed"}, coverage{" "}
                    {check.coveragePassed ? "passed" : "failed"}, lowest confidence{" "}
                    {check.minConfidence.toFixed(2)}
                  </li>
                ))}
            </ol>
          </div>
          <pre {...stylex.props(styles.pre)}>{JSON.stringify(run.result.summary, null, 2)}</pre>
        </>
      ) : null}
    </section>
  );
}
