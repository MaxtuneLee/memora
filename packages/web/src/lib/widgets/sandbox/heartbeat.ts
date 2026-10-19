// Pings the runner on a timer and reports when it stops answering. A runner in a separate process
// keeps answering while the host stays responsive, so a widget stuck in `while (true) {}` is
// noticed here and removed. In the same-process fallback the host freezes too, and this never
// fires: that case is not recoverable from inside the page.

export interface HeartbeatOptions {
  intervalMs: number;
  maxMissed: number;
  ping: (seq: number) => void;
  onUnresponsive: () => void;
  // Timers in hidden tabs are throttled hard enough to look like a hang, so misses only count
  // while the page is visible.
  isActive?: () => boolean;
}

export interface Heartbeat {
  pong: (seq: number) => void;
  stop: () => void;
}

export const startHeartbeat = ({
  intervalMs,
  maxMissed,
  ping,
  onUnresponsive,
  isActive = () => document.visibilityState === "visible",
}: HeartbeatOptions): Heartbeat => {
  let seq = 0;
  let acknowledged = 0;
  let missed = 0;
  let stopped = false;

  const intervalId = setInterval(() => {
    if (stopped) {
      return;
    }
    if (!isActive()) {
      missed = 0;
      acknowledged = seq;
      return;
    }
    missed = acknowledged >= seq ? 0 : missed + 1;
    if (missed >= maxMissed) {
      stopped = true;
      clearInterval(intervalId);
      onUnresponsive();
      return;
    }
    seq += 1;
    ping(seq);
  }, intervalMs);

  return {
    pong: (value) => {
      acknowledged = Math.max(acknowledged, value);
    },
    stop: () => {
      stopped = true;
      clearInterval(intervalId);
    },
  };
};
