import { describe, expect, it, vi } from "vite-plus/test";

import { createActionLimiters } from "@/lib/widgets/sandbox/limits";
import { HOST_MESSAGE, RUNNER_MESSAGE, type HostMessage } from "@/lib/widgets/sandbox/protocol";
import {
  routeRunnerMessage,
  type RunnerMessageHandlers,
  type RunnerRouterContext,
} from "@/lib/widgets/sandbox/runnerRouter";

const createContext = (handlers: RunnerMessageHandlers = {}) => {
  const posted: HostMessage[] = [];
  const lifecycle = {
    onBoot: vi.fn(),
    onPong: vi.fn(),
    onReady: vi.fn(),
    onResize: vi.fn(),
  };
  const context: RunnerRouterContext = {
    post: (message) => posted.push(message),
    limiters: createActionLimiters(() => 0),
    getHandlers: () => handlers,
    ...lifecycle,
  };
  return { context, posted, lifecycle };
};

describe("routeRunnerMessage", () => {
  it("passes lifecycle messages to the hook", () => {
    const { context, lifecycle } = createContext();

    routeRunnerMessage(context, { type: RUNNER_MESSAGE.boot });
    routeRunnerMessage(context, { type: RUNNER_MESSAGE.pong, seq: 4 });
    routeRunnerMessage(context, { type: RUNNER_MESSAGE.ready });
    routeRunnerMessage(context, { type: RUNNER_MESSAGE.resize, height: 90, hasContent: true });

    expect(lifecycle.onBoot).toHaveBeenCalledTimes(1);
    expect(lifecycle.onPong).toHaveBeenCalledWith(4);
    expect(lifecycle.onReady).toHaveBeenCalledTimes(1);
    expect(lifecycle.onResize).toHaveBeenCalledWith(90, true);
  });

  it("forwards run results and errors to the caller", () => {
    const onRunResult = vi.fn();
    const onRunnerError = vi.fn();
    const { context } = createContext({ onRunResult, onRunnerError });
    const result = {
      type: RUNNER_MESSAGE.runResult,
      signature: "s",
      scriptCount: 1,
      hasCleanup: false,
    } as const;
    const error = {
      type: RUNNER_MESSAGE.error,
      kind: "script",
      signature: "s",
      message: "boom",
    } as const;

    routeRunnerMessage(context, result);
    routeRunnerMessage(context, error);

    expect(onRunResult).toHaveBeenCalledWith(result);
    expect(onRunnerError).toHaveBeenCalledWith(error);
  });

  it("forwards a few prompts, ignores blank ones, and trims the length", () => {
    const onSendPrompt = vi.fn();
    const { context } = createContext({ onSendPrompt });

    routeRunnerMessage(context, { type: RUNNER_MESSAGE.sendPrompt, text: "   " });
    for (let index = 0; index < 10; index += 1) {
      routeRunnerMessage(context, { type: RUNNER_MESSAGE.sendPrompt, text: `p${index}` });
    }
    expect(onSendPrompt.mock.calls.map(([text]) => text)).toEqual(["p0", "p1", "p2"]);

    const long = createContext({ onSendPrompt });
    routeRunnerMessage(long.context, { type: RUNNER_MESSAGE.sendPrompt, text: "x".repeat(30_000) });
    expect(onSendPrompt.mock.calls.at(-1)?.[0]).toHaveLength(20_000);
  });

  it("opens only http and https links", () => {
    const onOpenLink = vi.fn();
    const { context } = createContext({ onOpenLink });

    routeRunnerMessage(context, { type: RUNNER_MESSAGE.openLink, url: "javascript:alert(1)" });
    routeRunnerMessage(context, { type: RUNNER_MESSAGE.openLink, url: "https://example.com" });

    expect(onOpenLink.mock.calls).toEqual([["https://example.com/"]]);
  });

  it("answers a write through the handler and reports its refusal", async () => {
    const onWriteData = vi.fn(async (name: string) =>
      name === "a.json" ? ({ ok: true } as const) : ({ ok: false, error: "not declared" } as const),
    );
    const { context, posted } = createContext({ onWriteData });

    routeRunnerMessage(context, {
      type: RUNNER_MESSAGE.writeData,
      requestId: "1",
      name: "a.json",
      content: "{}",
    });
    routeRunnerMessage(context, {
      type: RUNNER_MESSAGE.writeData,
      requestId: "2",
      name: "b.json",
      content: "{}",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(posted).toEqual([
      { type: HOST_MESSAGE.writeDataResult, requestId: "1", ok: true, error: undefined },
      { type: HOST_MESSAGE.writeDataResult, requestId: "2", ok: false, error: "not declared" },
    ]);
  });

  it("refuses a write when no handler is set, and when the budget is spent", async () => {
    const none = createContext();
    routeRunnerMessage(none.context, {
      type: RUNNER_MESSAGE.writeData,
      requestId: "1",
      name: "a.json",
      content: "",
    });
    expect(none.posted).toEqual([
      {
        type: HOST_MESSAGE.writeDataResult,
        requestId: "1",
        ok: false,
        error: "This widget cannot write data.",
      },
    ]);

    const onWriteData = vi.fn(async () => ({ ok: true }) as const);
    const busy = createContext({ onWriteData });
    for (let index = 0; index < 12; index += 1) {
      routeRunnerMessage(busy.context, {
        type: RUNNER_MESSAGE.writeData,
        requestId: String(index),
        name: "a.json",
        content: "",
      });
    }
    expect(onWriteData).toHaveBeenCalledTimes(10);
    expect(busy.posted.filter((message) => "error" in message && message.error)).toHaveLength(2);
  });

  it("turns a rejected write into an error reply", async () => {
    const onWriteData = vi.fn(async () => {
      throw new Error("disk full");
    });
    const { context, posted } = createContext({ onWriteData });

    routeRunnerMessage(context, {
      type: RUNNER_MESSAGE.writeData,
      requestId: "1",
      name: "a.json",
      content: "",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(posted).toEqual([
      { type: HOST_MESSAGE.writeDataResult, requestId: "1", ok: false, error: "disk full" },
    ]);
  });
});
