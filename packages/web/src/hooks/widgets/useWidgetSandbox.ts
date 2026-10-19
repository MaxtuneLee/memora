import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { useResolvedTheme } from "@/hooks/theme/useResolvedTheme";
import { startHeartbeat } from "@/lib/widgets/sandbox/heartbeat";
import {
  MAX_PROMPT_LENGTH,
  clampWidgetHeight,
  createActionLimiters,
  normalizeWidgetLink,
} from "@/lib/widgets/sandbox/limits";
import {
  HOST_MESSAGE,
  RUNNER_MESSAGE,
  parseRunnerMessage,
  type HostMessage,
  type RunnerMessage,
} from "@/lib/widgets/sandbox/protocol";
import {
  WIDGET_SANDBOX_ATTRIBUTE,
  buildRunnerSrc,
  resolveWidgetSandboxTarget,
} from "@/lib/widgets/sandbox/sandboxTarget";
import type { WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";

const HEARTBEAT_INTERVAL_MS = 2000;
const HEARTBEAT_MAX_MISSED = 3;
const LOAD_TIMEOUT_MS = 15_000;

export type WidgetSandboxFailure = "unresponsive" | "load-timeout" | "flooding";

export const WIDGET_FAILURE_COPY: Record<WidgetSandboxFailure, string> = {
  unresponsive: "This widget stopped responding.",
  "load-timeout": "This widget didn’t load.",
  flooding: "This widget was stopped for sending too many requests.",
};

export interface WidgetSandboxOptions {
  // The sandboxed widget can only reach these through postMessage (ADR 0006); the host decides
  // what "send to chat" and "open this link" actually do.
  onSendPrompt?: (text: string) => void;
  onOpenLink?: (url: string) => void;
  // Host-mediated write channel (ADR 0008). Omitting this refuses every write.
  onWriteData?: (name: string, content: string) => Promise<WriteWidgetDataResult>;
  onRunResult?: (
    message: Extract<RunnerMessage, { type: typeof RUNNER_MESSAGE.runResult }>,
  ) => void;
  onRunnerError?: (message: Extract<RunnerMessage, { type: typeof RUNNER_MESSAGE.error }>) => void;
}

export interface WidgetSandbox {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  // Changes on restart so React mounts a fresh iframe.
  frameKey: number;
  src: string;
  sandbox: string;
  // The runner has loaded and is listening, so render/run/data messages will be delivered.
  booted: boolean;
  // The widget's scripts have finished their first run.
  ready: boolean;
  height: number;
  hasContent: boolean;
  failure: WidgetSandboxFailure | null;
  post: (message: HostMessage) => void;
  restart: () => void;
}

// The host side of the widget runner protocol, shared by Chat and Home Grid. It owns the iframe's
// lifecycle: it checks every message came from this frame, rate-limits what the frame can ask
// for, clamps its height, pings it, and removes it if it stops answering or floods the host.
export const useWidgetSandbox = ({
  onSendPrompt,
  onOpenLink,
  onWriteData,
  onRunResult,
  onRunnerError,
}: WidgetSandboxOptions = {}): WidgetSandbox => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const theme = useResolvedTheme();
  const [initialTheme] = useState(theme);
  const [frameKey, setFrameKey] = useState(0);
  const [booted, setBooted] = useState(false);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(1);
  const [hasContent, setHasContent] = useState(false);
  const [failure, setFailure] = useState<WidgetSandboxFailure | null>(null);
  const handlersRef = useRef({ onSendPrompt, onOpenLink, onWriteData, onRunResult, onRunnerError });

  useEffect(() => {
    handlersRef.current = { onSendPrompt, onOpenLink, onWriteData, onRunResult, onRunnerError };
  }, [onSendPrompt, onOpenLink, onWriteData, onRunResult, onRunnerError]);

  const [target, setTarget] = useState(() => resolveWidgetSandboxTarget());
  const src = useMemo(() => buildRunnerSrc(target, initialTheme), [target, initialTheme]);

  // The frame's origin is opaque (see WIDGET_SANDBOX_ATTRIBUTE), so there is no origin to target.
  // Messages carry only data the widget is already entitled to.
  const post = useCallback((message: HostMessage) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const restart = useCallback(() => {
    setBooted(false);
    setReady(false);
    setHeight(1);
    setHasContent(false);
    setFailure(null);
    // Resolved again so coming back online switches an offline fallback to the isolated runner.
    setTarget(resolveWidgetSandboxTarget());
    setFrameKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (failure) {
      return;
    }

    const limiters = createActionLimiters();
    let heartbeat: ReturnType<typeof startHeartbeat> | null = null;
    let pendingHeight = 1;
    let heightFrame: number | null = null;

    const fail = (reason: WidgetSandboxFailure) => {
      heartbeat?.stop();
      setFailure(reason);
    };
    const loadTimeoutId = window.setTimeout(() => fail("load-timeout"), LOAD_TIMEOUT_MS);

    const handleMessage = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) {
        return;
      }

      if (!limiters.anyMessage.take()) {
        window.clearTimeout(loadTimeoutId);
        fail("flooding");
        return;
      }

      const message = parseRunnerMessage(event.data);
      if (!message) {
        return;
      }
      const handlers = handlersRef.current;

      switch (message.type) {
        case RUNNER_MESSAGE.boot:
          if (heartbeat) {
            return;
          }
          window.clearTimeout(loadTimeoutId);
          setBooted(true);
          heartbeat = startHeartbeat({
            intervalMs: HEARTBEAT_INTERVAL_MS,
            maxMissed: HEARTBEAT_MAX_MISSED,
            ping: (seq) => post({ type: HOST_MESSAGE.ping, seq }),
            onUnresponsive: () => fail("unresponsive"),
          });
          return;
        case RUNNER_MESSAGE.pong:
          heartbeat?.pong(message.seq);
          return;
        case RUNNER_MESSAGE.ready:
          setReady(true);
          return;
        case RUNNER_MESSAGE.resize:
          pendingHeight = clampWidgetHeight(message.height);
          setHasContent(message.hasContent);
          if (heightFrame === null) {
            heightFrame = window.requestAnimationFrame(() => {
              heightFrame = null;
              setHeight(pendingHeight);
            });
          }
          return;
        case RUNNER_MESSAGE.error:
          handlers.onRunnerError?.(message);
          return;
        case RUNNER_MESSAGE.runResult:
          handlers.onRunResult?.(message);
          return;
        case RUNNER_MESSAGE.sendPrompt: {
          const text = message.text.slice(0, MAX_PROMPT_LENGTH);
          if (text.trim() && limiters.sendPrompt.take()) {
            handlers.onSendPrompt?.(text);
          }
          return;
        }
        case RUNNER_MESSAGE.openLink: {
          const url = normalizeWidgetLink(message.url);
          if (url && limiters.openLink.take()) {
            handlers.onOpenLink?.(url);
          }
          return;
        }
        case RUNNER_MESSAGE.writeData: {
          const { requestId, name, content } = message;
          const respond = (result: WriteWidgetDataResult) => {
            post({
              type: HOST_MESSAGE.writeDataResult,
              requestId,
              ok: result.ok,
              error: result.ok ? undefined : result.error,
            });
          };
          if (!limiters.writeData.take()) {
            respond({ ok: false, error: "Too many writes. Try again in a moment." });
            return;
          }
          if (!handlers.onWriteData) {
            respond({ ok: false, error: "This widget cannot write data." });
            return;
          }
          handlers.onWriteData(name, content).then(respond, (error: unknown) => {
            respond({ ok: false, error: error instanceof Error ? error.message : "Write failed." });
          });
          return;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(loadTimeoutId);
      heartbeat?.stop();
      if (heightFrame !== null) {
        window.cancelAnimationFrame(heightFrame);
      }
    };
  }, [failure, frameKey, post]);

  useEffect(() => {
    if (booted) {
      post({ type: HOST_MESSAGE.theme, theme });
    }
  }, [booted, post, theme]);

  return {
    iframeRef,
    frameKey,
    src,
    sandbox: WIDGET_SANDBOX_ATTRIBUTE,
    booted,
    ready,
    height,
    hasContent,
    failure,
    post,
    restart,
  };
};
