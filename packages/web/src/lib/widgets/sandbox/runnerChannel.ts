import { startHeartbeat, type Heartbeat } from "./heartbeat";
import { clampWidgetHeight, createActionLimiters } from "./limits";
import { HOST_MESSAGE, parseRunnerMessage, type HostMessage } from "./protocol";
import {
  routeRunnerMessage,
  type RunnerMessageHandlers,
  type RunnerRouterContext,
} from "./runnerRouter";

const HEARTBEAT_INTERVAL_MS = 2000;
const HEARTBEAT_MAX_MISSED = 3;
const LOAD_TIMEOUT_MS = 15_000;

export type WidgetSandboxFailure = "unresponsive" | "load-timeout" | "flooding";

export interface RunnerChannelOptions {
  getFrameWindow: () => Window | null;
  post: (message: HostMessage) => void;
  getHandlers: () => RunnerMessageHandlers;
  onBooted: () => void;
  onReady: () => void;
  onContent: (hasContent: boolean) => void;
  // The height is already clamped and coalesced to one update per animation frame.
  onResize: (height: number) => void;
  // The frame has to go: it stopped answering, never loaded, or flooded the host.
  onFailure: (reason: WidgetSandboxFailure) => void;
}

// Listens to one runner frame for its whole life. It accepts only messages from that frame's
// window, counts every message against a flood budget, pings the frame once it has booted, and
// gives up on a frame that never boots. Returns a function that stops all of it.
export const connectRunnerChannel = (options: RunnerChannelOptions): (() => void) => {
  const { getFrameWindow, post, onBooted, onReady, onContent, onResize, onFailure } = options;
  const limiters = createActionLimiters();
  let heartbeat: Heartbeat | null = null;
  let pendingHeight = 1;
  let heightFrame: number | null = null;

  const fail = (reason: WidgetSandboxFailure): void => {
    window.clearTimeout(loadTimeoutId);
    heartbeat?.stop();
    onFailure(reason);
  };
  const loadTimeoutId = window.setTimeout(() => fail("load-timeout"), LOAD_TIMEOUT_MS);

  const scheduleHeight = (height: number, hasContent: boolean): void => {
    pendingHeight = clampWidgetHeight(height);
    onContent(hasContent);
    if (heightFrame === null) {
      heightFrame = window.requestAnimationFrame(() => {
        heightFrame = null;
        onResize(pendingHeight);
      });
    }
  };

  const boot = (): void => {
    if (heartbeat) {
      return;
    }
    window.clearTimeout(loadTimeoutId);
    onBooted();
    heartbeat = startHeartbeat({
      intervalMs: HEARTBEAT_INTERVAL_MS,
      maxMissed: HEARTBEAT_MAX_MISSED,
      ping: (seq) => post({ type: HOST_MESSAGE.ping, seq }),
      onUnresponsive: () => fail("unresponsive"),
    });
  };

  const context: RunnerRouterContext = {
    post,
    limiters,
    getHandlers: options.getHandlers,
    onBoot: boot,
    onPong: (seq) => heartbeat?.pong(seq),
    onReady,
    onResize: scheduleHeight,
  };

  const handleMessage = (event: MessageEvent): void => {
    if (!event.source || event.source !== getFrameWindow()) {
      return;
    }
    if (!limiters.anyMessage.take()) {
      fail("flooding");
      return;
    }
    const message = parseRunnerMessage(event.data);
    if (message) {
      routeRunnerMessage(context, message);
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
};
