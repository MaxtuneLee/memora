import {
  projectHistory,
  type AgentMessage,
  type CompactionParameters,
  type CompactionState,
} from "@memora/ai-core";

import type { TraceEvent } from "./traceRecorder";

export interface TraceTurn {
  /** Model calls so far in the Run; 0 is before the first one. */
  turn: number;
  events: TraceEvent[];
}

export interface TraceRun {
  events: TraceEvent[];
  turns: TraceTurn[];
  /** False without `run.settled`: the Run is still going or its worker stopped. */
  complete: boolean;
  outcome?: string;
  startedAt?: number;
}

export interface RenderedRequest {
  systemPrompt?: string;
  tools?: unknown[];
  /** In the order sent; `message` is undefined when the Trace never recorded that ID. */
  messages: Array<{ id: string; message: AgentMessage | undefined }>;
}

/**
 * Groups a Run's events by model turn. Events the worker writes itself (`run.settled`, an
 * unsettled tool, a gap) carry no turn and belong to the turn they were written in.
 */
export const readRun = (events: TraceEvent[]): TraceRun => {
  const turns: TraceTurn[] = [];
  for (const event of events) {
    const turn = typeof event.turn === "number" ? event.turn : (turns.at(-1)?.turn ?? 0);
    const last = turns.at(-1);
    if (last?.turn === turn) last.events.push(event);
    else turns.push({ turn, events: [event] });
  }
  const settled = events.find((event) => event.type === "run.settled");
  return {
    events,
    turns,
    complete: Boolean(settled),
    ...(typeof settled?.outcome === "string" ? { outcome: settled.outcome } : {}),
    ...(events[0]?.type === "run.started" ? { startedAt: events[0].timestamp } : {}),
  };
};

/** The history as it stood right before `until`: the Run's starting history plus added messages. */
export const historyBefore = (events: TraceEvent[], until: TraceEvent): AgentMessage[] => {
  const byId = new Map<string, AgentMessage>();
  for (const event of events) {
    if (event.sequence >= until.sequence) break;
    if (event.type === "run.started" && Array.isArray(event.history))
      for (const message of event.history as AgentMessage[]) byId.set(message.id, message);
    if (event.type === "message.added") {
      const message = event.message as AgentMessage;
      byId.set(message.id, message);
    }
  }
  return [...byId.values()];
};

/** Rebuilds what the model received with the recorded compaction state and parameters. */
export const renderRequest = (events: TraceEvent[], request: TraceEvent): RenderedRequest => {
  const history = historyBefore(events, request);
  const compaction = request.compaction as CompactionState | undefined;
  const parameters = request.parameters as CompactionParameters | undefined;
  // ponytail: projects the whole history, while a summary request projects only its prefix; the
  // kept image can differ in a summary request, which reads fine for a development view.
  const rendered =
    compaction && parameters ? projectHistory(history, compaction, parameters) : history;
  const byId = new Map(rendered.map((message) => [message.id, message]));
  if (typeof request.instruction === "string")
    byId.set("compaction-instruction", {
      id: "compaction-instruction",
      role: "user",
      content: [{ type: "text", text: request.instruction }],
      createdAt: request.timestamp,
    });
  // System prompt and tools are recorded only when they change, so take the latest ones.
  let systemPrompt: string | undefined;
  let tools: unknown[] | undefined;
  for (const event of events) {
    if (event.sequence > request.sequence) break;
    if (event.type !== "model.request") continue;
    if (typeof event.systemPrompt === "string") systemPrompt = event.systemPrompt;
    if (Array.isArray(event.tools)) tools = event.tools;
  }
  const messageIds = Array.isArray(request.messageIds) ? (request.messageIds as string[]) : [];
  return {
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(tools ? { tools } : {}),
    messages: messageIds.map((id) => ({ id, message: byId.get(id) })),
  };
};
