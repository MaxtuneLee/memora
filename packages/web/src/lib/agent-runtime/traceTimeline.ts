import { pairOf, type TraceRun } from "./traceReader";
import type { TraceEvent } from "./traceRecorder";

export type TimelineScale = "duration" | "turns";
export type TimelineLane = "input" | "model" | "tools";
export type TimelineKind = "input" | "model" | "tool" | "compaction" | "gap" | "run";

export interface TimelineBar {
  /** The event the bar selects: its row in the event list. */
  sequence: number;
  lane: TimelineLane;
  kind: TimelineKind;
  /** Fractions of the track width. */
  left: number;
  width: number;
}

/** Keeps instant events visible. */
export const MIN_BAR_WIDTH = 0.004;
/** Share of a slot a bar fills on the Turns scale, leaving a gap between bars. */
const SLOT_FILL = 0.9;

const LANES: Record<string, [TimelineLane, TimelineKind]> = {
  "run.started": ["input", "input"],
  "input.applied": ["input", "input"],
  "run.settled": ["input", "run"],
  "model.request": ["model", "model"],
  "context.compacted": ["model", "compaction"],
  "context.trimmed": ["model", "compaction"],
  "trace.gap": ["model", "gap"],
  "tool.started": ["tools", "tool"],
};

const lastTimestamp = (run: TraceRun): number => run.events.at(-1)?.timestamp ?? 0;
const originOf = (run: TraceRun): number => run.startedAt ?? run.events[0]?.timestamp ?? 0;

/**
 * Bars for the Input, Model, and Tools lanes. A model call spans its request to its response and
 * a tool call its start to its settlement; one still open runs to the last recorded event.
 */
export const layoutTimeline = (run: TraceRun, scale: TimelineScale): TimelineBar[] => {
  const origin = originOf(run);
  const end = lastTimestamp(run);
  const total = Math.max(end - origin, 1);
  return run.turns.flatMap((group, turnIndex) => {
    const shown = group.events.filter((event) => LANES[event.type]);
    return shown.map((event: TraceEvent, index): TimelineBar => {
      const [lane, kind] = LANES[event.type]!;
      if (scale === "turns") {
        const slot = 1 / (run.turns.length * shown.length);
        return {
          sequence: event.sequence,
          lane,
          kind,
          left: turnIndex / run.turns.length + index * slot,
          width: SLOT_FILL * slot,
        };
      }
      const pair = pairOf(run.events, event);
      const span = event.type === "model.request" || event.type === "tool.started";
      const until = span ? (pair?.timestamp ?? end) : event.timestamp;
      const width = Math.max((until - event.timestamp) / total, MIN_BAR_WIDTH);
      return {
        sequence: event.sequence,
        lane,
        kind,
        left: Math.min((event.timestamp - origin) / total, 1 - width),
        width,
      };
    });
  });
};

export interface RunStats {
  durationMs: number;
  /** Reply model calls; summary calls are compaction. */
  turns: number;
  inputTokens: number;
  outputTokens: number;
  compactions: number;
}

/** Footer totals; a running Run's duration is up to its last recorded event. */
export const summarizeRun = (run: TraceRun): RunStats => {
  const stats: RunStats = {
    durationMs: lastTimestamp(run) - originOf(run),
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    compactions: 0,
  };
  for (const event of run.events) {
    if (event.type === "model.request" && event.purpose === "reply") stats.turns += 1;
    if (event.type === "context.compacted") stats.compactions += 1;
    if (event.type === "model.response") {
      const usage = event.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      stats.inputTokens += usage?.inputTokens ?? 0;
      stats.outputTokens += usage?.outputTokens ?? 0;
    }
  }
  return stats;
};
