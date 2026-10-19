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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isScriptSpec = (value: unknown): value is WidgetScriptSpec => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.src === "string" || typeof value.content === "string";
};

// The frame is untrusted: anything it posts is checked field by field before the host acts on it.
export const parseRunnerMessage = (data: unknown): RunnerMessage | null => {
  if (!isRecord(data)) {
    return null;
  }

  switch (data.type) {
    case RUNNER_MESSAGE.boot:
      return { type: RUNNER_MESSAGE.boot };
    case RUNNER_MESSAGE.ready:
      return { type: RUNNER_MESSAGE.ready };
    case RUNNER_MESSAGE.pong:
      return typeof data.seq === "number" ? { type: RUNNER_MESSAGE.pong, seq: data.seq } : null;
    case RUNNER_MESSAGE.resize:
      return typeof data.height === "number" && typeof data.hasContent === "boolean"
        ? { type: RUNNER_MESSAGE.resize, height: data.height, hasContent: data.hasContent }
        : null;
    case RUNNER_MESSAGE.error:
      return typeof data.message === "string"
        ? {
            type: RUNNER_MESSAGE.error,
            kind: data.kind === "listener" ? "listener" : "script",
            signature: typeof data.signature === "string" ? data.signature : null,
            message: data.message,
          }
        : null;
    case RUNNER_MESSAGE.runResult:
      return typeof data.signature === "string"
        ? {
            type: RUNNER_MESSAGE.runResult,
            signature: data.signature,
            scriptCount: typeof data.scriptCount === "number" ? data.scriptCount : 0,
            hasCleanup: data.hasCleanup === true,
          }
        : null;
    case RUNNER_MESSAGE.sendPrompt:
      return typeof data.text === "string"
        ? { type: RUNNER_MESSAGE.sendPrompt, text: data.text }
        : null;
    case RUNNER_MESSAGE.openLink:
      return typeof data.url === "string" ? { type: RUNNER_MESSAGE.openLink, url: data.url } : null;
    case RUNNER_MESSAGE.writeData:
      return typeof data.requestId === "string" &&
        typeof data.name === "string" &&
        typeof data.content === "string"
        ? {
            type: RUNNER_MESSAGE.writeData,
            requestId: data.requestId,
            name: data.name,
            content: data.content,
          }
        : null;
    default:
      return null;
  }
};

export const parseHostMessage = (data: unknown): HostMessage | null => {
  if (!isRecord(data)) {
    return null;
  }

  switch (data.type) {
    case HOST_MESSAGE.render:
      return typeof data.style === "string" && typeof data.html === "string"
        ? { type: HOST_MESSAGE.render, style: data.style, html: data.html }
        : null;
    case HOST_MESSAGE.run:
      return typeof data.signature === "string" &&
        Array.isArray(data.scripts) &&
        data.scripts.every(isScriptSpec)
        ? { type: HOST_MESSAGE.run, signature: data.signature, scripts: data.scripts }
        : null;
    case HOST_MESSAGE.teardown:
      return { type: HOST_MESSAGE.teardown };
    case HOST_MESSAGE.data:
      return { type: HOST_MESSAGE.data, payload: data.payload };
    case HOST_MESSAGE.theme:
      return data.theme === "light" || data.theme === "dark"
        ? { type: HOST_MESSAGE.theme, theme: data.theme }
        : null;
    case HOST_MESSAGE.ping:
      return typeof data.seq === "number" ? { type: HOST_MESSAGE.ping, seq: data.seq } : null;
    case HOST_MESSAGE.writeDataResult:
      return typeof data.requestId === "string" && typeof data.ok === "boolean"
        ? {
            type: HOST_MESSAGE.writeDataResult,
            requestId: data.requestId,
            ok: data.ok,
            error: typeof data.error === "string" ? data.error : undefined,
          }
        : null;
    default:
      return null;
  }
};
