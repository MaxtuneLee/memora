import type { ResolvedTheme } from "@/lib/theme/documentTheme";

// The message protocol between the host app and the widget runner page (ADR 0011). Home Grid and
// Chat widgets share it. The runner lives in an iframe that, when a sandbox origin is configured,
// sits on another site, so none of these messages can carry a live object reference.

export const HOST_MESSAGE = {
  render: "memora:widget:render",
  run: "memora:widget:run",
  teardown: "memora:widget:teardown",
  data: "memora:widget:data",
  theme: "memora:widget:theme",
  ping: "memora:widget:ping",
  writeDataResult: "memora:widget:write-data-result",
} as const;

export const RUNNER_MESSAGE = {
  boot: "memora:widget:boot",
  pong: "memora:widget:pong",
  ready: "memora:widget:ready",
  resize: "memora:widget:resize",
  error: "memora:widget:error",
  runResult: "memora:widget:run-result",
  sendPrompt: "memora:widget:send-prompt",
  openLink: "memora:widget:open-link",
  writeData: "memora:widget:write-data",
} as const;

export type WidgetScriptSpec = { src: string } | { content: string };

export type HostMessage =
  | { type: typeof HOST_MESSAGE.render; style: string; html: string }
  | { type: typeof HOST_MESSAGE.run; signature: string; scripts: WidgetScriptSpec[] }
  | { type: typeof HOST_MESSAGE.teardown }
  | { type: typeof HOST_MESSAGE.data; payload: unknown }
  | { type: typeof HOST_MESSAGE.theme; theme: ResolvedTheme }
  | { type: typeof HOST_MESSAGE.ping; seq: number }
  | {
      type: typeof HOST_MESSAGE.writeDataResult;
      requestId: string;
      ok: boolean;
      error?: string;
    };

// "script" errors come from the widget script (or a script tag that failed to load); "listener"
// errors come from an onData callback, which Chat treats as non-fatal.
export type WidgetErrorKind = "script" | "listener";

export type RunnerMessage =
  | { type: typeof RUNNER_MESSAGE.boot }
  | { type: typeof RUNNER_MESSAGE.pong; seq: number }
  | { type: typeof RUNNER_MESSAGE.ready }
  | { type: typeof RUNNER_MESSAGE.resize; height: number; hasContent: boolean }
  | {
      type: typeof RUNNER_MESSAGE.error;
      kind: WidgetErrorKind;
      signature: string | null;
      message: string;
    }
  | {
      type: typeof RUNNER_MESSAGE.runResult;
      signature: string;
      scriptCount: number;
      hasCleanup: boolean;
    }
  | { type: typeof RUNNER_MESSAGE.sendPrompt; text: string }
  | { type: typeof RUNNER_MESSAGE.openLink; url: string }
  | { type: typeof RUNNER_MESSAGE.writeData; requestId: string; name: string; content: string };

type Fields = Record<string, unknown>;
type Parser<Message> = (fields: Fields) => Message | null;

const isRecord = (value: unknown): value is Fields => typeof value === "object" && value !== null;

const isScriptSpec = (value: unknown): value is WidgetScriptSpec => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.src === "string" || typeof value.content === "string";
};

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number";

// Each parser checks the fields of one message type and returns the typed message, or null.
// The frame is untrusted: anything it posts is checked field by field before the host acts on it.
const RUNNER_PARSERS = new Map<string, Parser<RunnerMessage>>([
  [RUNNER_MESSAGE.boot, () => ({ type: RUNNER_MESSAGE.boot })],
  [RUNNER_MESSAGE.ready, () => ({ type: RUNNER_MESSAGE.ready })],
  [RUNNER_MESSAGE.pong, ({ seq }) => (isNumber(seq) ? { type: RUNNER_MESSAGE.pong, seq } : null)],
  [
    RUNNER_MESSAGE.resize,
    ({ height, hasContent }) =>
      isNumber(height) && typeof hasContent === "boolean"
        ? { type: RUNNER_MESSAGE.resize, height, hasContent }
        : null,
  ],
  [
    RUNNER_MESSAGE.error,
    ({ kind, signature, message }) =>
      isString(message)
        ? {
            type: RUNNER_MESSAGE.error,
            kind: kind === "listener" ? "listener" : "script",
            signature: isString(signature) ? signature : null,
            message,
          }
        : null,
  ],
  [
    RUNNER_MESSAGE.runResult,
    ({ signature, scriptCount, hasCleanup }) =>
      isString(signature)
        ? {
            type: RUNNER_MESSAGE.runResult,
            signature,
            scriptCount: isNumber(scriptCount) ? scriptCount : 0,
            hasCleanup: hasCleanup === true,
          }
        : null,
  ],
  [
    RUNNER_MESSAGE.sendPrompt,
    ({ text }) => (isString(text) ? { type: RUNNER_MESSAGE.sendPrompt, text } : null),
  ],
  [
    RUNNER_MESSAGE.openLink,
    ({ url }) => (isString(url) ? { type: RUNNER_MESSAGE.openLink, url } : null),
  ],
  [
    RUNNER_MESSAGE.writeData,
    ({ requestId, name, content }) =>
      isString(requestId) && isString(name) && isString(content)
        ? { type: RUNNER_MESSAGE.writeData, requestId, name, content }
        : null,
  ],
]);

const HOST_PARSERS = new Map<string, Parser<HostMessage>>([
  [
    HOST_MESSAGE.render,
    ({ style, html }) =>
      isString(style) && isString(html) ? { type: HOST_MESSAGE.render, style, html } : null,
  ],
  [
    HOST_MESSAGE.run,
    ({ signature, scripts }) =>
      isString(signature) && Array.isArray(scripts) && scripts.every(isScriptSpec)
        ? { type: HOST_MESSAGE.run, signature, scripts }
        : null,
  ],
  [HOST_MESSAGE.teardown, () => ({ type: HOST_MESSAGE.teardown })],
  [HOST_MESSAGE.data, ({ payload }) => ({ type: HOST_MESSAGE.data, payload })],
  [
    HOST_MESSAGE.theme,
    ({ theme }) =>
      theme === "light" || theme === "dark" ? { type: HOST_MESSAGE.theme, theme } : null,
  ],
  [HOST_MESSAGE.ping, ({ seq }) => (isNumber(seq) ? { type: HOST_MESSAGE.ping, seq } : null)],
  [
    HOST_MESSAGE.writeDataResult,
    ({ requestId, ok, error }) =>
      isString(requestId) && typeof ok === "boolean"
        ? {
            type: HOST_MESSAGE.writeDataResult,
            requestId,
            ok,
            error: isString(error) ? error : undefined,
          }
        : null,
  ],
]);

const parseWith = <Message>(
  parsers: Map<string, Parser<Message>>,
  data: unknown,
): Message | null => {
  if (!isRecord(data) || !isString(data.type)) {
    return null;
  }
  return parsers.get(data.type)?.(data) ?? null;
};

export const parseRunnerMessage = (data: unknown): RunnerMessage | null =>
  parseWith(RUNNER_PARSERS, data);

export const parseHostMessage = (data: unknown): HostMessage | null =>
  parseWith(HOST_PARSERS, data);
