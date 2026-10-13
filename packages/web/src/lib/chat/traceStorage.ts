import { dir, file, write } from "@memora/fs";

const TRACES_DIR = "/chat/traces";

const safeId = (id: string): string => {
  if (!/^[\w-]+$/.test(id)) throw new Error(`Invalid trace ID: ${id}`);
  return id;
};

const sessionDir = (sessionId: string): string => `${TRACES_DIR}/${safeId(sessionId)}`;
const runPath = (sessionId: string, runId: string): string =>
  `${sessionDir(sessionId)}/${safeId(runId)}.jsonl`;

/** Appends JSONL text to a Run's Trace, creating it if needed. */
export const appendTrace = (sessionId: string, runId: string, text: string): Promise<void> =>
  write(runPath(sessionId, runId), text, { append: true });

export const listTraceRuns = async (sessionId: string): Promise<string[]> => {
  const directory = dir(sessionDir(sessionId));
  if (!(await directory.exists())) return [];
  return (await directory.children())
    .filter((entry) => entry.kind === "file" && entry.name.endsWith(".jsonl"))
    .map((entry) => entry.name.slice(0, -".jsonl".length));
};

export const readTraceText = (sessionId: string, runId: string): Promise<string> =>
  file(runPath(sessionId, runId)).text();

export const deleteSessionTraces = (sessionId: string): Promise<void> =>
  dir(sessionDir(sessionId)).remove({ recursive: true, force: true });

export const clearTraces = (): Promise<void> =>
  dir(TRACES_DIR).remove({ recursive: true, force: true });
