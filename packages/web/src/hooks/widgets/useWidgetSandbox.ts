import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RefObject } from "react";

import { useResolvedTheme } from "@/hooks/theme/useResolvedTheme";
import { createFrameState, frameReducer } from "@/lib/widgets/sandbox/frameState";
import { readCachedHeight, writeCachedHeight } from "@/lib/widgets/sandbox/heightCache";
import { HOST_MESSAGE, type HostMessage } from "@/lib/widgets/sandbox/protocol";
import {
  connectRunnerChannel,
  type WidgetSandboxFailure,
} from "@/lib/widgets/sandbox/runnerChannel";
import type { RunnerMessageHandlers } from "@/lib/widgets/sandbox/runnerRouter";
import {
  WIDGET_SANDBOX_ATTRIBUTE,
  buildRunnerSrc,
  resolveWidgetSandboxTarget,
} from "@/lib/widgets/sandbox/sandboxTarget";

export type { WidgetSandboxFailure };

export const WIDGET_FAILURE_COPY: Record<WidgetSandboxFailure, string> = {
  unresponsive: "This widget stopped responding.",
  "load-timeout": "This widget didn’t load.",
  flooding: "This widget was stopped for sending too many requests.",
};

// The sandboxed widget can only reach these through postMessage (ADR 0006); the host decides what
// "send to chat" and "open this link" actually do. Omitting onWriteData refuses every write
// (ADR 0008).
export interface WidgetSandboxOptions extends RunnerMessageHandlers {
  // Names this widget in the height cache, so its frame reserves the height it had last time
  // instead of starting at one pixel and pushing the content below it down when it loads.
  heightKey?: string;
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
  heightKey,
}: WidgetSandboxOptions = {}): WidgetSandbox => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const theme = useResolvedTheme();
  const [initialTheme] = useState(theme);
  const [frame, dispatch] = useReducer(frameReducer, heightKey, (key) =>
    createFrameState(readCachedHeight(key)),
  );
  const { frameKey, booted, failure } = frame;
  const handlersRef = useRef({ onSendPrompt, onOpenLink, onWriteData, onRunResult, onRunnerError });

  useEffect(() => {
    handlersRef.current = { onSendPrompt, onOpenLink, onWriteData, onRunResult, onRunnerError };
  }, [onSendPrompt, onOpenLink, onWriteData, onRunResult, onRunnerError]);

  const { ready, height } = frame;
  useEffect(() => {
    if (ready) {
      writeCachedHeight(heightKey, height);
    }
  }, [heightKey, ready, height]);

  const [target, setTarget] = useState(() => resolveWidgetSandboxTarget());
  const src = useMemo(() => buildRunnerSrc(target, initialTheme), [target, initialTheme]);

  // The frame's origin is opaque (see WIDGET_SANDBOX_ATTRIBUTE), so there is no origin to target.
  // Messages carry only data the widget is already entitled to.
  const post = useCallback((message: HostMessage) => {
    // fallow-ignore-next-line security-sink -- The frame has an opaque origin, so no target origin can match; the target is the frame this hook created, and messages carry only data that widget may already read.
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const restart = useCallback(() => {
    dispatch({ type: "restart" });
    // Resolved again so coming back online switches an offline fallback to the isolated runner.
    setTarget(resolveWidgetSandboxTarget());
  }, []);

  useEffect(() => {
    if (failure) {
      return;
    }
    return connectRunnerChannel({
      getFrameWindow: () => iframeRef.current?.contentWindow ?? null,
      post,
      getHandlers: () => handlersRef.current,
      onBooted: () => dispatch({ type: "booted" }),
      onReady: () => dispatch({ type: "ready" }),
      onContent: (hasContent) => dispatch({ type: "content", hasContent }),
      onResize: (height) => dispatch({ type: "resize", height }),
      onFailure: (reason) => dispatch({ type: "failed", reason }),
    });
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
    ready: frame.ready,
    height: frame.height,
    hasContent: frame.hasContent,
    failure,
    post,
    restart,
  };
};
