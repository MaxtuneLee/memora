import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { startHeartbeat } from "@/lib/widgets/sandbox/heartbeat";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startHeartbeat", () => {
  it("stays quiet while every ping is answered", () => {
    const onUnresponsive = vi.fn();
    const heartbeat = startHeartbeat({
      intervalMs: 1000,
      maxMissed: 3,
      isActive: () => true,
      ping: (seq) => heartbeat.pong(seq),
      onUnresponsive,
    });

    vi.advanceTimersByTime(30_000);

    expect(onUnresponsive).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it("reports a frame that stops answering after the allowed misses", () => {
    const onUnresponsive = vi.fn();
    const ping = vi.fn();
    const heartbeat = startHeartbeat({
      intervalMs: 1000,
      maxMissed: 3,
      isActive: () => true,
      ping,
      onUnresponsive,
    });

    vi.advanceTimersByTime(3000);
    expect(onUnresponsive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onUnresponsive).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(onUnresponsive).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(3);
    heartbeat.stop();
  });

  it("forgives a slow answer that arrives before the limit", () => {
    const onUnresponsive = vi.fn();
    const heartbeat = startHeartbeat({
      intervalMs: 1000,
      maxMissed: 3,
      isActive: () => true,
      ping: () => {},
      onUnresponsive,
    });

    vi.advanceTimersByTime(3000);
    heartbeat.pong(3);
    vi.advanceTimersByTime(3000);

    expect(onUnresponsive).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it("does not count misses while the page is hidden", () => {
    let active = false;
    const onUnresponsive = vi.fn();
    const heartbeat = startHeartbeat({
      intervalMs: 1000,
      maxMissed: 3,
      isActive: () => active,
      ping: () => {},
      onUnresponsive,
    });

    vi.advanceTimersByTime(60_000);
    expect(onUnresponsive).not.toHaveBeenCalled();

    active = true;
    vi.advanceTimersByTime(3000);
    expect(onUnresponsive).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it("stops pinging after stop()", () => {
    const ping = vi.fn();
    const heartbeat = startHeartbeat({
      intervalMs: 1000,
      maxMissed: 3,
      isActive: () => true,
      ping,
      onUnresponsive: () => {},
    });

    heartbeat.stop();
    vi.advanceTimersByTime(10_000);

    expect(ping).not.toHaveBeenCalled();
  });
});
