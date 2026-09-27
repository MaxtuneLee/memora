// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { TraceEvent } from "@/lib/agent-runtime/traceRecorder";

const client = vi.hoisted(() => ({
  clearTraces: vi.fn(),
  exportTrace: vi.fn(),
  getSnapshot: vi.fn(),
  listTraceRuns: vi.fn(),
  readTrace: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("@/lib/agent-runtime/client", () => client);

import { ChatPageTracePanel } from "@/components/chat/chatPage/ChatPageTracePanel";

afterEach(cleanup);

const event = (sequence: number, type: string): TraceEvent => ({
  formatVersion: 1,
  sessionId: "eval-1",
  runId: "run-1",
  sequence,
  timestamp: sequence,
  type,
  ...(type === "run.settled" ? { outcome: "completed" } : {}),
});

describe("ChatPageTracePanel with a stored Run", () => {
  test("reads the Run without subscribing to its deleted session", async () => {
    client.readTrace.mockResolvedValue([event(0, "run.started"), event(1, "run.settled")]);

    render(<ChatPageTracePanel sessionId="eval-1" runId="run-1" />);

    expect(await screen.findAllByText("completed")).not.toHaveLength(0);
    expect(client.readTrace).toHaveBeenCalledWith("eval-1", "run-1");
    expect(client.subscribe).not.toHaveBeenCalled();
    expect(client.getSnapshot).not.toHaveBeenCalled();
    expect(client.listTraceRuns).not.toHaveBeenCalled();
    expect(screen.queryByText("Clear all traces")).toBeNull();
  });
});
