import { describe, expect, it } from "vite-plus/test";
import type { AgentMessage, CompactionParameters } from "@memora/ai-core";

import {
  pairOf,
  readRun,
  renderRequest,
  runForInput,
  toolDefinition,
} from "@/lib/agent-runtime/traceReader";
import type { TraceEvent } from "@/lib/agent-runtime/traceRecorder";

const text = (id: string, role: AgentMessage["role"], body: string): AgentMessage => ({
  id,
  role,
  createdAt: 1,
  content: [{ type: "text", text: body }],
});

const PARAMETERS: CompactionParameters = {
  write: { threshold: 1_000, head: 800, tail: 100 },
  compact: { threshold: 20, head: 10, tail: 5 },
  cold: { threshold: 10, head: 5, tail: 2 },
  protectedTurns: 1,
};

let sequence = 0;
const event = (body: { type: string } & Record<string, unknown>): TraceEvent => ({
  formatVersion: 1,
  sessionId: "s",
  runId: "r1",
  sequence: sequence++,
  timestamp: 1_000 + sequence,
  ...body,
});

const trace = (): TraceEvent[] => {
  sequence = 0;
  return [
    event({
      type: "run.started",
      submissionId: "r1",
      compactionParameters: PARAMETERS,
      history: [text("u1", "user", "first question"), text("a1", "assistant", "x".repeat(60))],
    }),
    event({ type: "message.added", turn: 0, message: text("u2", "user", "second question") }),
    event({
      type: "model.request",
      turn: 1,
      purpose: "reply",
      messageIds: ["u1", "a1", "u2"],
      compaction: { compactedThrough: "a1" },
      parameters: PARAMETERS,
      systemPrompt: "Be brief.",
      model: { api: "a", provider: "p", id: "m" },
      settings: {},
    }),
    event({ type: "model.response", turn: 1, purpose: "reply", text: "", durationMs: 5 }),
    event({ type: "message.added", turn: 1, message: text("a2", "assistant", "answer") }),
    event({
      type: "model.request",
      turn: 2,
      purpose: "summary",
      messageIds: ["u1", "compaction-instruction"],
      compaction: {},
      parameters: PARAMETERS,
      instruction: "Summarize.",
      model: { api: "a", provider: "p", id: "m" },
      settings: {},
    }),
    // Written by the worker without a turn when a tool never settled.
    event({ type: "tool.settled", toolCallId: "c1", name: "read_file", outcome: "unknown" }),
  ];
};

describe("trace reader", () => {
  it("groups events by model turn, carrying the turn to events recorded without one", () => {
    const run = readRun(trace());
    expect(run.turns.map((turn) => [turn.turn, turn.events.map((item) => item.type)])).toEqual([
      [0, ["run.started", "message.added"]],
      [1, ["model.request", "model.response", "message.added"]],
      [2, ["model.request", "tool.settled"]],
    ]);
  });

  it("marks a Trace without run.settled incomplete", () => {
    const events = trace();
    expect(readRun(events).complete).toBe(false);
    const settled = [...events, event({ type: "run.settled", outcome: "completed" })];
    expect(readRun(settled)).toMatchObject({ complete: true, outcome: "completed" });
  });

  it("re-renders a request from recorded messages, compaction state, and parameters", () => {
    const events = trace();
    const request = renderRequest(events, events[2]!);
    expect(request.systemPrompt).toBe("Be brief.");
    expect(request.messages.map((item) => item.id)).toEqual(["u1", "a1", "u2"]);
    const a1 = request.messages[1]!.message!.content[0];
    expect(a1).toMatchObject({ type: "text" });
    expect(a1?.type === "text" && a1.text).toContain("[omitted 45 characters, recall ID: a1]");
    expect(request.messages[2]!.message).toEqual(text("u2", "user", "second question"));
  });

  it("appends the summary instruction and keeps the last recorded system prompt", () => {
    const events = trace();
    const request = renderRequest(events, events[5]!);
    expect(request.systemPrompt).toBe("Be brief.");
    expect(request.messages.map((item) => item.id)).toEqual(["u1", "compaction-instruction"]);
    expect(request.messages[1]!.message?.content).toEqual([{ type: "text", text: "Summarize." }]);
  });

  it("reports a message ID the Trace never recorded", () => {
    const events = trace();
    const request = renderRequest(events, { ...events[2]!, messageIds: ["missing"] });
    expect(request.messages).toEqual([{ id: "missing", message: undefined }]);
  });

  it("pairs a request with its response and a tool start with its settlement", () => {
    const events = trace();
    expect(pairOf(events, events[2]!)?.type).toBe("model.response");
    expect(pairOf(events, events[5]!)).toBeUndefined();
    const started = event({ type: "tool.started", toolCallId: "c1", name: "read_file" });
    expect(pairOf([...events, started], started)).toBeUndefined();
    const other = event({ type: "tool.settled", toolCallId: "c2", name: "read_file" });
    const settled = event({ type: "tool.settled", toolCallId: "c1", name: "read_file" });
    expect(pairOf([...events, started, other, settled], started)).toBe(settled);
  });

  it("finds the tool definition in effect when the call started", () => {
    sequence = 0;
    const definition = (description: string) => ({
      name: "read_file",
      description,
      parameters: { type: "object" },
    });
    const request = (tools?: unknown[]) =>
      event({
        type: "model.request",
        purpose: "reply",
        messageIds: [],
        ...(tools ? { tools } : {}),
      });
    const events = [
      request([definition("old")]),
      event({ type: "tool.started", toolCallId: "c1", name: "read_file" }),
      request(),
      event({ type: "tool.started", toolCallId: "c2", name: "read_file" }),
      request([definition("new")]),
      event({ type: "tool.started", toolCallId: "c3", name: "read_file" }),
      event({ type: "tool.started", toolCallId: "c4", name: "write_file" }),
    ];
    expect(toolDefinition(events, events[1]!)).toEqual(definition("old"));
    expect(toolDefinition(events, events[3]!)).toEqual(definition("old"));
    expect(toolDefinition(events, events[5]!)).toEqual(definition("new"));
    expect(toolDefinition(events, events[6]!)).toBeUndefined();
  });

  it("finds the latest Run that took a message as its input or a steer", () => {
    const started = (runId: string, at: number, inputId: string): TraceEvent => ({
      formatVersion: 1,
      sessionId: "s",
      runId,
      sequence: 0,
      timestamp: at,
      type: "run.started",
      submission: { input: text(inputId, "user", "question") },
    });
    const steer = {
      ...started("r2", 20, "u2"),
      sequence: 3,
      type: "input.applied",
      messageId: "u3",
    };
    const runs = [
      { runId: "r1", run: readRun([started("r1", 10, "u1")]) },
      { runId: "r2", run: readRun([started("r2", 20, "u2"), steer]) },
      { runId: "r3", run: readRun([started("r3", 30, "u1")]) },
    ];
    expect(runForInput(runs, "u1")).toBe("r3");
    expect(runForInput(runs, "u3")).toBe("r2");
    expect(runForInput(runs, "missing")).toBeUndefined();
  });
});
