// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { HOST_MESSAGE, RUNNER_MESSAGE } from "@/lib/widgets/sandbox/protocol";
import { connectRunnerChannel } from "@/lib/widgets/sandbox/runnerChannel";

const frameWindow = {} as Window;

const setup = () => {
  const options = {
    getFrameWindow: () => frameWindow,
    post: vi.fn(),
    getHandlers: () => ({}),
    onBooted: vi.fn(),
    onReady: vi.fn(),
    onContent: vi.fn(),
    onResize: vi.fn(),
    onFailure: vi.fn(),
  };
  const disconnect = connectRunnerChannel(options);
  const send = (data: unknown, source: unknown = frameWindow) => {
    window.dispatchEvent(
      new MessageEvent("message", { data, source: source as MessageEventSource }),
    );
  };
  return { options, disconnect, send };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(0), 16),
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => window.clearTimeout(id));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("connectRunnerChannel", () => {
  it("ignores messages from any window but the frame", () => {
    const { options, disconnect, send } = setup();

    send({ type: RUNNER_MESSAGE.boot }, window);
    send({ type: RUNNER_MESSAGE.boot }, null);

    expect(options.onBooted).not.toHaveBeenCalled();
    disconnect();
  });

  it("reports the boot once, then pings and removes a frame that stops answering", () => {
    const { options, disconnect, send } = setup();
    const isVisible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    send({ type: RUNNER_MESSAGE.boot });
    send({ type: RUNNER_MESSAGE.boot });
    expect(options.onBooted).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(options.post).toHaveBeenCalledWith({ type: HOST_MESSAGE.ping, seq: 1 });

    vi.advanceTimersByTime(10_000);
    expect(options.onFailure).toHaveBeenCalledWith("unresponsive");
    isVisible.mockRestore();
    disconnect();
  });

  it("keeps a frame that answers its pings", () => {
    const { options, disconnect, send } = setup();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    send({ type: RUNNER_MESSAGE.boot });
    for (let tick = 1; tick <= 10; tick += 1) {
      vi.advanceTimersByTime(2000);
      send({ type: RUNNER_MESSAGE.pong, seq: tick });
    }

    expect(options.onFailure).not.toHaveBeenCalled();
    disconnect();
  });

  it("gives up on a frame that never boots", () => {
    const { options, disconnect } = setup();

    vi.advanceTimersByTime(15_000);

    expect(options.onFailure).toHaveBeenCalledWith("load-timeout");
    disconnect();
  });

  it("removes a frame that floods the host", () => {
    const { options, disconnect, send } = setup();

    for (let count = 0; count < 500; count += 1) {
      send({ type: RUNNER_MESSAGE.pong, seq: count });
    }

    expect(options.onFailure).toHaveBeenCalledWith("flooding");
    disconnect();
  });

  it("clamps and coalesces height updates, and reports content at once", () => {
    const { options, disconnect, send } = setup();

    send({ type: RUNNER_MESSAGE.resize, height: 100, hasContent: true });
    send({ type: RUNNER_MESSAGE.resize, height: 1e9, hasContent: true });
    expect(options.onContent).toHaveBeenCalledTimes(2);
    expect(options.onResize).not.toHaveBeenCalled();

    vi.advanceTimersByTime(16);
    expect(options.onResize).toHaveBeenCalledTimes(1);
    expect(options.onResize).toHaveBeenCalledWith(4000);
    disconnect();
  });

  it("passes ready through and stops listening after disconnect", () => {
    const { options, disconnect, send } = setup();

    send({ type: RUNNER_MESSAGE.ready });
    expect(options.onReady).toHaveBeenCalledTimes(1);

    disconnect();
    send({ type: RUNNER_MESSAGE.ready });
    expect(options.onReady).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(options.onFailure).not.toHaveBeenCalled();
  });
});
