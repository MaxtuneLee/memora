import type { TraceRecord } from "@memora/ai-core";

import { appendTrace } from "@/lib/chat/traceStorage";
import type { DeliveryMode, SessionSnapshot } from "./protocol";

export const TRACE_FORMAT_VERSION = 1;
const FLUSH_DELAY_MS = 1_000;

/** One stored Trace line: the envelope plus the event's own fields. */
export interface TraceEvent {
  formatVersion: typeof TRACE_FORMAT_VERSION;
  sessionId: string;
  runId: string;
  sequence: number;
  timestamp: number;
  type: string;
  [field: string]: unknown;
}

export interface AcceptedInput {
  submissionId: string;
  mode: DeliveryMode;
  acceptedAt: number;
}

type RunOutcome = NonNullable<SessionSnapshot["outcome"]>;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Serializing inside the callback copies the live objects ai-core hands over. Raw image and
 * file data is replaced by its size; name and media type stay.
 */
const serialize = (event: TraceEvent): string =>
  JSON.stringify(event, (_key, value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      "mimeType" in value &&
      "data" in value &&
      typeof value.data === "string"
    ) {
      const { data, ...rest } = value;
      // ponytail: base64 length estimate, off by up to two bytes of padding.
      return { ...rest, size: Math.floor((data.length * 3) / 4) };
    }
    return value;
  });

/**
 * Buffers one Run's Trace and appends it at checkpoints. A failed write drops its events; the
 * next successful write adds `trace.gap` with the count and reason.
 */
export class TraceRecorder {
  readonly runId: string;
  private sessionId: string;
  private inputs: (messageId: string) => AcceptedInput | undefined;
  private sequence = 0;
  private lines: string[] = [];
  private dropped = 0;
  private dropReason = "";
  private writes: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private openTools = new Map<string, string>();
  private finalMessageId?: string;

  constructor(
    sessionId: string,
    runId: string,
    inputs: (messageId: string) => AcceptedInput | undefined,
  ) {
    this.sessionId = sessionId;
    this.runId = runId;
    this.inputs = inputs;
  }

  /** Never throws: an event that cannot be serialized is counted like a failed write. */
  add(body: { type: string } & Record<string, unknown>): void {
    try {
      this.lines.push(serialize(this.envelope(body)));
    } catch (error) {
      this.dropped += 1;
      this.dropReason = errorMessage(error);
      return;
    }
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
  }

  private envelope(body: { type: string } & Record<string, unknown>): TraceEvent {
    return {
      formatVersion: TRACE_FORMAT_VERSION,
      sessionId: this.sessionId,
      runId: this.runId,
      sequence: this.sequence++,
      timestamp: Date.now(),
      ...body,
    };
  }

  /** The `AgentOptions.trace` callback. */
  readonly trace = (record: TraceRecord): void => {
    switch (record.type) {
      case "input.applied":
        this.add({ ...record, ...this.inputs(record.messageId) });
        return;
      case "message.added":
        if (record.message.role === "assistant") this.finalMessageId = record.message.id;
        break;
      case "tool.started":
        this.openTools.set(record.toolCallId, record.name);
        break;
      case "tool.settled":
        this.openTools.delete(record.toolCallId);
        this.add({ ...record, outcome: "known" });
        return;
    }
    this.add(record);
    // End of a model turn.
    if (record.type === "model.response") void this.flush();
  };

  /** Records the terminal outcome and writes everything buffered. */
  settle(outcome: RunOutcome, error?: string): Promise<void> {
    // A tool still running may have had a side effect, so its outcome is unknown.
    for (const [toolCallId, name] of this.openTools)
      this.add({ type: "tool.settled", toolCallId, name, outcome: "unknown" });
    this.openTools.clear();
    this.add({
      type: "run.settled",
      outcome,
      ...(error ? { error } : {}),
      ...(this.finalMessageId ? { finalMessageId: this.finalMessageId } : {}),
    });
    return this.flush();
  }

  /** Never rejects: observation must not change what the agent does. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.writes = this.writes.then(async () => {
      if (!this.lines.length) return;
      const events = this.lines.splice(0);
      const gap = this.dropped
        ? [
            serialize(
              this.envelope({ type: "trace.gap", dropped: this.dropped, reason: this.dropReason }),
            ),
          ]
        : [];
      try {
        await appendTrace(this.sessionId, this.runId, `${[...events, ...gap].join("\n")}\n`);
        this.dropped = 0;
      } catch (error) {
        this.dropped += events.length;
        this.dropReason = errorMessage(error);
      }
    });
    return this.writes;
  }
}

/** Parses a stored Trace, ordered by sequence. */
export const parseTrace = (text: string): TraceEvent[] =>
  text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TraceEvent)
    .sort((a, b) => a.sequence - b.sequence);
