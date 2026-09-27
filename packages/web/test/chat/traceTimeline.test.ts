import { describe, expect, it } from "vite-plus/test";

import { readRun } from "@/lib/agent-runtime/traceReader";
import type { TraceEvent } from "@/lib/agent-runtime/traceRecorder";
import { layoutTimeline, MIN_BAR_WIDTH, summarizeRun } from "@/lib/agent-runtime/traceTimeline";

let sequence = 0;
const at = (timestamp: number, body: { type: string } & Record<string, unknown>): TraceEvent => ({
  formatVersion: 1,
  sessionId: "s",
  runId: "r1",
  sequence: sequence++,
  timestamp,
  ...body,
});

/** Two model turns with a tool call, a compaction, and a gap. */
const trace = (settled = true): TraceEvent[] => {
  sequence = 0;
  return [
    at(0, { type: "run.started" }),
    at(100, { type: "model.request", turn: 1, purpose: "reply", messageIds: [] }),
    at(300, {
      type: "model.response",
      turn: 1,
      purpose: "reply",
      usage: { inputTokens: 1_000, outputTokens: 20 },
    }),
    at(300, { type: "tool.started", turn: 1, toolCallId: "c1", name: "read_file" }),
    at(500, { type: "tool.settled", turn: 1, toolCallId: "c1", name: "read_file" }),
    at(500, { type: "context.compacted", turn: 2, layer: "microcompact" }),
    at(510, { type: "model.request", turn: 2, purpose: "reply", messageIds: [] }),
    at(900, {
      type: "model.response",
      turn: 2,
      purpose: "reply",
      usage: { inputTokens: 600, outputTokens: 80 },
    }),
    at(950, { type: "trace.gap", dropped: 2, reason: "QuotaExceededError" }),
    ...(settled ? [at(1_000, { type: "run.settled", outcome: "completed" })] : []),
  ];
};

const shape = (bars: ReturnType<typeof layoutTimeline>) =>
  bars.map(({ sequence: id, lane, kind, left, width }) => [
    id,
    lane,
    kind,
    Number(left.toFixed(4)),
    Number(width.toFixed(4)),
  ]);

describe("trace timeline", () => {
  it("places bars by time on the Duration scale, with compaction and gaps as their own kinds", () => {
    expect(shape(layoutTimeline(readRun(trace()), "duration"))).toEqual([
      [0, "input", "input", 0, MIN_BAR_WIDTH],
      [1, "model", "model", 0.1, 0.2],
      [3, "tools", "tool", 0.3, 0.2],
      [5, "model", "compaction", 0.5, MIN_BAR_WIDTH],
      [6, "model", "model", 0.51, 0.39],
      [8, "model", "gap", 0.95, MIN_BAR_WIDTH],
      [9, "input", "run", 1 - MIN_BAR_WIDTH, MIN_BAR_WIDTH],
    ]);
  });

  it("gives each turn an equal slot on the Turns scale", () => {
    const third = 1 / 3;
    expect(shape(layoutTimeline(readRun(trace()), "turns"))).toEqual(
      [
        [0, "input", "input", 0, 0.9 * third],
        [1, "model", "model", third, 0.15],
        [3, "tools", "tool", third + third / 2, 0.15],
        [5, "model", "compaction", 2 * third, 0.075],
        [6, "model", "model", 2 * third + third / 4, 0.075],
        [8, "model", "gap", 2 * third + (2 * third) / 4, 0.075],
        [9, "input", "run", 2 * third + (3 * third) / 4, 0.075],
      ].map(([id, lane, kind, left, width]) => [
        id,
        lane,
        kind,
        Number((left as number).toFixed(4)),
        Number((width as number).toFixed(4)),
      ]),
    );
  });

  it("runs an open call to the last recorded event while the Run is going", () => {
    const events = [...trace(false).slice(0, 7), at(2_000, { type: "message.added", turn: 2 })];
    const bars = layoutTimeline(readRun(events), "duration");
    expect(bars.at(-1)).toMatchObject({ sequence: 6, left: 0.255, width: 0.745 });
  });

  it("totals duration, turns, token usage, and compactions", () => {
    expect(summarizeRun(readRun(trace()))).toEqual({
      durationMs: 1_000,
      turns: 2,
      inputTokens: 1_600,
      outputTokens: 100,
      compactions: 1,
    });
    expect(summarizeRun(readRun(trace(false))).durationMs).toBe(950);
  });
});
