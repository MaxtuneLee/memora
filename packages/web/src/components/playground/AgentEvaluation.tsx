import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import {
  importEvaluationLectures,
  parseEvaluationImport,
  type EvaluationImport,
} from "@/lib/playground/evaluationImport";
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

type ImportState =
  | { status: "idle" }
  | { status: "importing" }
  | { status: "failed"; message: string }
  | { status: "imported"; data: EvaluationImport; created: number; existing: number };

export default function AgentEvaluation() {
  const store = useAppStore();
  const [state, setState] = useState<ImportState>({ status: "idle" });

  const [dataFiles, setDataFiles] = useState<File[]>([]);
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);

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
        </>
      ) : null}
    </section>
  );
}
