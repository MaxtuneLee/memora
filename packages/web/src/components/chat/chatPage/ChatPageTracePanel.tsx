import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AgentMessage } from "@memora/ai-core";
import * as stylex from "@stylexjs/stylex";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TabSelect } from "@/components/ui/TabSelect";
import {
  clearTraces,
  exportTrace,
  getSnapshot,
  listTraceRuns,
  readTrace,
  subscribe,
} from "@/lib/agent-runtime/client";
import {
  pairOf,
  readRun,
  renderRequest,
  runForInput,
  toolDefinition,
  type TraceRun,
} from "@/lib/agent-runtime/traceReader";
import type { TraceEvent } from "@/lib/agent-runtime/traceRecorder";
import {
  layoutTimeline,
  summarizeRun,
  type TimelineBar,
  type TimelineScale,
} from "@/lib/agent-runtime/traceTimeline";
import { tokens } from "../../../styles/stylex.stylex";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
// Compaction placeholders written by the history projection.
const PLACEHOLDER = /(…\[omitted [^\]]*\]…|\[[^\]]*omitted, recall ID: [^\]]*\])/;

const styles = stylex.create({
  root: { display: "flex", flex: 1, flexDirection: "column", minHeight: 0 },
  toolbar: {
    alignItems: "center",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    paddingBlock: 8,
    paddingInline: 16,
  },
  picker: { flex: "1 1 280px", minWidth: 0 },
  search: { flex: "0 1 220px" },
  split: {
    display: "grid",
    flex: 1,
    gridTemplateColumns: {
      default: "minmax(0, 1fr) minmax(0, 440px)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    minHeight: 0,
  },
  rows: { minHeight: 0, overflowY: "auto" },
  turnHead: {
    backgroundColor: tokens.surface,
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: tokens.textMuted,
    fontSize: "0.75rem",
    fontWeight: 500,
    paddingBlock: 6,
    paddingInline: 16,
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  row: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": tokens.hover },
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderLeftColor: "transparent",
    borderLeftStyle: "solid",
    borderLeftWidth: 3,
    borderRightWidth: 0,
    borderTopWidth: 0,
    color: tokens.text,
    cursor: "pointer",
    display: "grid",
    gap: 10,
    gridTemplateColumns: "104px minmax(0, 1fr) 56px",
    paddingBlock: 7,
    paddingLeft: 13,
    paddingRight: 16,
    textAlign: "left",
    width: "100%",
  },
  rowSelected: { backgroundColor: tokens.surfaceMuted, borderLeftColor: tokens.olive },
  line: {
    fontFamily: MONO,
    fontSize: "0.8125rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  arrow: { color: tokens.textSoft, marginInline: 6 },
  result: { color: tokens.textMuted },
  time: {
    color: tokens.textSoft,
    fontFamily: MONO,
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
  },
  chip: {
    borderRadius: 4,
    fontSize: "0.6875rem",
    fontWeight: 500,
    justifySelf: "start",
    paddingBlock: 1,
    paddingInline: 7,
    whiteSpace: "nowrap",
  },
  neutral: { backgroundColor: tokens.surfaceMuted, color: tokens.textMuted },
  input: { backgroundColor: tokens.selected, color: tokens.oliveText },
  model: { backgroundColor: tokens.infoSurface, color: tokens.infoText },
  tool: { backgroundColor: tokens.warningSurface, color: tokens.warningText },
  bad: { backgroundColor: tokens.dangerSurface, color: tokens.dangerText },
  detail: {
    backgroundColor: tokens.background,
    borderLeftColor: tokens.border,
    borderLeftStyle: "solid",
    borderLeftWidth: { default: 1, "@media (max-width: 900px)": 0 },
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: { default: 0, "@media (max-width: 900px)": 1 },
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  },
  detailHead: {
    alignItems: "center",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    paddingBlock: 10,
    paddingInline: 16,
  },
  where: { color: tokens.textSoft, fontFamily: MONO, fontSize: "0.75rem" },
  detailBody: {
    alignContent: "start",
    display: "grid",
    gap: 10,
    minHeight: 0,
    overflowY: "auto",
    paddingBottom: 20,
    paddingInline: 16,
    paddingTop: 12,
  },
  kv: {
    display: "grid",
    fontSize: "0.8125rem",
    gap: "4px 12px",
    gridTemplateColumns: "120px minmax(0, 1fr)",
    margin: 0,
  },
  key: { color: tokens.textSoft },
  value: { margin: 0, overflowWrap: "anywhere" },
  pre: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: 6,
    fontFamily: MONO,
    fontSize: "0.75rem",
    lineHeight: 1.55,
    margin: 0,
    overflowWrap: "anywhere",
    paddingBlock: 8,
    paddingInline: 10,
    whiteSpace: "pre-wrap",
  },
  hint: { color: tokens.textSoft, fontSize: "0.75rem", margin: 0 },
  mark: { backgroundColor: tokens.warningSurface, borderRadius: 3, color: tokens.warningText },
  message: {
    backgroundColor: tokens.card,
    borderColor: tokens.border,
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
  },
  messageSummary: {
    cursor: "pointer",
    display: "grid",
    fontFamily: MONO,
    fontSize: "0.75rem",
    gap: 8,
    gridTemplateColumns: "72px 96px minmax(0, 1fr)",
    listStyle: "none",
    paddingBlock: 5,
    paddingInline: 8,
  },
  empty: { color: tokens.textMuted, paddingBlock: 40, paddingInline: 16, textAlign: "center" },
  strip: {
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    overflowX: "auto",
    paddingBottom: 10,
    paddingInline: 16,
    paddingTop: 8,
  },
  lane: {
    alignItems: "center",
    display: "grid",
    gridTemplateColumns: "52px minmax(480px, 1fr)",
    height: 20,
  },
  laneLabel: { color: tokens.textSoft, fontSize: "0.6875rem", paddingRight: 8, textAlign: "right" },
  track: { height: 12, position: "relative" },
  bar: {
    borderRadius: 2,
    borderWidth: 0,
    cursor: "pointer",
    height: 12,
    minWidth: 3,
    padding: 0,
    position: "absolute",
    top: 0,
  },
  barSelected: {
    outlineColor: tokens.text,
    outlineOffset: 1,
    outlineStyle: "solid",
    outlineWidth: 2,
  },
  barInput: { backgroundColor: tokens.chart1 },
  barRun: { backgroundColor: tokens.textSoft },
  barModel: { backgroundColor: tokens.chart5 },
  barTool: { backgroundColor: tokens.chart3 },
  barCompaction: {
    backgroundImage: `repeating-linear-gradient(45deg, ${tokens.warningText} 0 2px, transparent 2px 5px)`,
  },
  barGap: { backgroundColor: tokens.dangerText },
  footer: {
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: tokens.textMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    gap: "6px 16px",
    paddingBlock: 8,
    paddingInline: 16,
  },
  footerValue: { color: tokens.text, fontWeight: 500 },
});

const BAR_STYLES = {
  input: styles.barInput,
  run: styles.barRun,
  model: styles.barModel,
  tool: styles.barTool,
  compaction: styles.barCompaction,
  gap: styles.barGap,
} as const;

const LANE_LABELS = [
  ["input", "Input"],
  ["model", "Model"],
  ["tools", "Tools"],
] as const;

const SCALE_OPTIONS = [
  { value: "duration", label: "Duration" },
  { value: "turns", label: "Turns" },
] as const;

// Traces are written at the end of each model turn, every second, and at the end of the Run.
const LIVE_READ_MS = 1_000;

type Kind = "neutral" | "input" | "model" | "tool" | "bad";

interface Row {
  event: TraceEvent;
  label: string;
  kind: Kind;
  line: string;
  result: string;
  /** The event that completes this one: a model response, or a tool's settlement. */
  pair?: TraceEvent;
}

const asText = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");

/** One line for a row. */
const preview = (value: unknown): string => asText(value).replace(/\s+/g, " ");

const contentText = (message: AgentMessage): string =>
  message.content
    .map((item) => {
      if (item.type === "text") return item.text;
      if (item.type === "tool_call") return `${item.name} ${JSON.stringify(item.arguments)}`;
      if (item.type === "tool_result") return asText(item.result);
      if (item.type === "file") return `[file ${item.name}]`;
      return `[image ${item.mimeType}]`;
    })
    .join("\n");

/** One row per step: a response folds into its request, a settlement into its tool start. */
const toRows = (events: TraceEvent[]): Row[] =>
  events.flatMap((event): Row[] => {
    switch (event.type) {
      case "run.started": {
        const input = (event.submission as { input?: AgentMessage } | undefined)?.input;
        return [
          {
            event,
            label: "Run started",
            kind: "neutral",
            line: input ? preview(contentText(input)) : preview(event.submissionId),
            result: preview(event.appVersion),
          },
        ];
      }
      case "input.applied":
        return [
          {
            event,
            label: "Input",
            kind: "input",
            line: `${preview(event.submissionId ?? event.messageId)} · ${preview(event.mode ?? "steer")}`,
            result: preview(event.messageId),
          },
        ];
      case "message.added": {
        const message = event.message as AgentMessage;
        return [
          {
            event,
            label: "Message",
            kind: "neutral",
            line: `${message.role} · ${message.id}`,
            result: preview(contentText(message)),
          },
        ];
      }
      case "context.compacted":
        return [
          {
            event,
            label: "Compaction",
            kind: "tool",
            line: `${preview(event.layer)} · ${preview(event.trigger)}`,
            result: `${preview(event.tokensBefore)} → ${preview(event.tokensAfter)} tokens`,
          },
        ];
      case "context.trimmed":
        return [
          {
            event,
            label: "Trimmed",
            kind: "bad",
            line: `${(event.droppedMessageIds as string[]).length} messages dropped`,
            result: `${preview(event.tokensBefore)} → ${preview(event.tokensAfter)} tokens`,
          },
        ];
      case "model.request": {
        const pair = pairOf(events, event);
        const calls = (pair?.toolCalls as unknown[] | undefined)?.length ?? 0;
        return [
          {
            event,
            pair,
            label: event.purpose === "summary" ? "Summary" : "Model",
            kind: "model",
            line: `${(event.messageIds as string[]).length} messages`,
            result: !pair
              ? "no response"
              : pair.error
                ? `error: ${preview(pair.error)}`
                : calls
                  ? `${calls} tool call${calls === 1 ? "" : "s"} · ${preview(pair.finishReason ?? "")}`
                  : preview(pair.text),
          },
        ];
      }
      case "tool.started": {
        const pair = pairOf(events, event);
        return [
          {
            event,
            pair,
            label: "Tool",
            kind: pair?.isError || pair?.outcome === "unknown" ? "bad" : "tool",
            line: `${preview(event.name)} ${preview(event.arguments)}`,
            result: !pair
              ? "running"
              : pair.outcome === "unknown"
                ? "unknown outcome"
                : preview(pair.result),
          },
        ];
      }
      case "trace.gap":
        return [
          {
            event,
            label: "Gap",
            kind: "bad",
            line: `${preview(event.dropped)} events not written`,
            result: preview(event.reason),
          },
        ];
      case "run.settled":
        return [
          {
            event,
            label: "Run",
            kind: event.outcome === "completed" ? "input" : "bad",
            line: preview(event.outcome),
            result: event.finalMessageId ? `final message ${preview(event.finalMessageId)}` : "",
          },
        ];
      // Shown with the event they complete.
      case "model.response":
      case "tool.settled":
        return [];
      default:
        return [{ event, label: event.type, kind: "neutral", line: "", result: "" }];
    }
  });

const withMarks = (text: string) =>
  text.split(PLACEHOLDER).map((part, index) =>
    index % 2 ? (
      <mark key={index} {...stylex.props(styles.mark)}>
        {part}
      </mark>
    ) : (
      part
    ),
  );

const Pre = ({ children }: { children: string }) => (
  <pre {...stylex.props(styles.pre)}>{withMarks(children)}</pre>
);

const KeyValues = ({ entries }: { entries: Array<[string, unknown]> }) => (
  <dl {...stylex.props(styles.kv)}>
    {entries
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => (
        <div key={key} style={{ display: "contents" }}>
          <dt {...stylex.props(styles.key)}>{key}</dt>
          <dd {...stylex.props(styles.value)}>
            {typeof value === "string" ? value : JSON.stringify(value)}
          </dd>
        </div>
      ))}
  </dl>
);

const MessageRow = ({ id, role, text }: { id: string; role: string; text: string }) => (
  <details {...stylex.props(styles.message)}>
    <summary {...stylex.props(styles.messageSummary)}>
      <span {...stylex.props(styles.key)}>{role}</span>
      <span {...stylex.props(styles.key, styles.line)}>{id}</span>
      <span {...stylex.props(styles.line)}>{withMarks(text.slice(0, 200))}</span>
    </summary>
    <Pre>{text}</Pre>
  </details>
);

const Schema = ({ definition }: { definition: unknown }) =>
  definition ? (
    <>
      <p {...stylex.props(styles.hint)}>
        From the latest tool definitions recorded before this call.
      </p>
      <Pre>{JSON.stringify(definition, null, 2)}</Pre>
    </>
  ) : (
    <p {...stylex.props(styles.hint)}>No definition of this tool was recorded before the call.</p>
  );

type DetailTab = "summary" | "request" | "response" | "arguments" | "result" | "schema" | "timing";

const seconds = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;

/** When a call started and settled, as clock time and time into the Run. */
const timingOf = (run: TraceRun, row: Row): Array<[string, unknown]> => {
  const origin = run.startedAt ?? row.event.timestamp;
  const clock = (event: TraceEvent) =>
    `${new Date(event.timestamp).toLocaleTimeString()} · ${seconds(event.timestamp - origin)} into the Run`;
  return [
    ["Started", clock(row.event)],
    ["Ended", row.pair ? clock(row.pair) : "not yet"],
    [
      "Duration",
      row.pair?.durationMs === undefined ? undefined : `${preview(row.pair.durationMs)} ms`,
    ],
  ];
};

const summaryOf = (row: Row): Array<[string, unknown]> => {
  const {
    type: _type,
    formatVersion: _v,
    sessionId: _s,
    runId: _r,
    sequence,
    timestamp,
    ...rest
  } = row.event;
  if (row.event.type === "model.request")
    return [
      ["Purpose", rest.purpose],
      ["Model", (rest.model as { id?: string } | undefined)?.id],
      ["Finish", row.pair?.finishReason],
      ["Usage", row.pair?.usage],
      ["Duration", row.pair ? `${preview(row.pair.durationMs)} ms` : undefined],
      ["Compaction state", rest.compaction],
      ["Settings", rest.settings],
      ["Error", row.pair?.error],
    ];
  if (row.event.type === "tool.started")
    return [
      ["Call", rest.toolCallId],
      ["Outcome", row.pair?.outcome ?? "running"],
      ["Raw length", row.pair?.rawLength],
      [
        "Duration",
        row.pair?.durationMs === undefined ? undefined : `${preview(row.pair.durationMs)} ms`,
      ],
      ["Error", row.pair?.isError ? "yes" : undefined],
    ];
  // Bulky fields have their own tabs or rows.
  const { history: _h, message: _m, ...shown } = rest;
  return [
    ["Sequence", sequence],
    ["Time", new Date(timestamp).toLocaleTimeString()],
    ...Object.entries(shown).map(([key, value]): [string, unknown] => [key, value]),
  ];
};

const Detail = ({ run, row }: { run: TraceRun; row: Row }) => {
  const tabs: Array<{ value: DetailTab; label: string }> = [{ value: "summary", label: "Summary" }];
  if (row.event.type === "model.request")
    tabs.push(
      { value: "request", label: "Request" },
      { value: "response", label: "Response" },
      { value: "timing", label: "Timing" },
    );
  if (row.event.type === "tool.started")
    tabs.push(
      { value: "arguments", label: "Arguments" },
      { value: "result", label: "Result" },
      { value: "schema", label: "Schema" },
      { value: "timing", label: "Timing" },
    );
  const [selected, setSelected] = useState<DetailTab>("summary");
  const tab = tabs.some((item) => item.value === selected) ? selected : "summary";
  const request = useMemo(
    () => (tab === "request" ? renderRequest(run.events, row.event) : undefined),
    [run, row, tab],
  );
  const message = row.event.type === "message.added" ? (row.event.message as AgentMessage) : null;

  return (
    <aside aria-label="Event details" {...stylex.props(styles.detail)}>
      <div {...stylex.props(styles.detailHead)}>
        <span {...stylex.props(styles.chip, styles[row.kind])}>{row.label}</span>
        <span {...stylex.props(styles.where)}>
          Turn {preview(row.event.turn ?? "–")} · event {row.event.sequence}
        </span>
        {tabs.length > 1 ? (
          <TabSelect
            aria-label="Event view"
            value={tab}
            onValueChange={setSelected}
            options={tabs}
          />
        ) : null}
      </div>
      <div {...stylex.props(styles.detailBody)}>
        {tab === "summary" ? (
          <>
            <KeyValues entries={summaryOf(row)} />
            {message ? <Pre>{contentText(message)}</Pre> : null}
          </>
        ) : null}
        {request ? (
          <>
            <p {...stylex.props(styles.hint)}>
              Rendered with the recorded compaction state and limits. Highlighted text is what
              compaction replaced. Open a message for its full content.
            </p>
            {request.systemPrompt !== undefined ? (
              <MessageRow id="prompt" role="system" text={request.systemPrompt} />
            ) : null}
            {request.messages.map(({ id, message: item }) => (
              <MessageRow
                key={id}
                id={id}
                role={item?.role ?? "?"}
                text={item ? contentText(item) : "Not recorded in this Trace."}
              />
            ))}
            {request.tools ? (
              <p {...stylex.props(styles.hint)}>{request.tools.length} tool definitions</p>
            ) : null}
          </>
        ) : null}
        {tab === "response" ? (
          row.pair ? (
            <>
              {row.pair.reasoning ? <Pre>{`Reasoning:\n${asText(row.pair.reasoning)}`}</Pre> : null}
              <Pre>{asText(row.pair.text) || "(no text)"}</Pre>
              {Array.isArray(row.pair.toolCalls) && row.pair.toolCalls.length ? (
                <Pre>{JSON.stringify(row.pair.toolCalls, null, 2)}</Pre>
              ) : null}
              {row.pair.error ? <Pre>{`Error: ${asText(row.pair.error)}`}</Pre> : null}
            </>
          ) : (
            <p {...stylex.props(styles.hint)}>No response was recorded.</p>
          )
        ) : null}
        {tab === "arguments" ? <Pre>{JSON.stringify(row.event.arguments, null, 2)}</Pre> : null}
        {tab === "result" ? (
          row.pair && "result" in row.pair ? (
            <Pre>{asText(row.pair.result)}</Pre>
          ) : (
            <p {...stylex.props(styles.hint)}>No result was recorded.</p>
          )
        ) : null}
        {tab === "schema" ? <Schema definition={toolDefinition(run.events, row.event)} /> : null}
        {tab === "timing" ? <KeyValues entries={timingOf(run, row)} /> : null}
      </div>
    </aside>
  );
};

const Timeline = ({
  bars,
  rows,
  selected,
  onSelect,
}: {
  bars: TimelineBar[];
  rows: Row[];
  selected: number | undefined;
  onSelect: (sequence: number) => void;
}) => {
  const rowOf = new Map(rows.map((row) => [row.event.sequence, row]));
  return (
    <div role="group" aria-label="Timeline" {...stylex.props(styles.strip)}>
      {LANE_LABELS.map(([lane, label]) => (
        <div key={lane} {...stylex.props(styles.lane)}>
          <span {...stylex.props(styles.laneLabel)}>{label}</span>
          <div {...stylex.props(styles.track)}>
            {bars
              .filter((bar) => bar.lane === lane)
              .map((bar) => {
                const row = rowOf.get(bar.sequence);
                return (
                  <button
                    key={bar.sequence}
                    type="button"
                    aria-label={row ? `${row.label}: ${row.line}` : String(bar.sequence)}
                    aria-pressed={bar.sequence === selected}
                    onClick={() => onSelect(bar.sequence)}
                    {...stylex.props(
                      styles.bar,
                      BAR_STYLES[bar.kind],
                      bar.sequence === selected && styles.barSelected,
                    )}
                    style={{ left: `${bar.left * 100}%`, width: `${bar.width * 100}%` }}
                  />
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
};

const Footer = ({ run, status }: { run: TraceRun; status: string }) => {
  const stats = summarizeRun(run);
  const items: Array<[string, string]> = [
    ["Status", status],
    ["Duration", seconds(stats.durationMs)],
    ["Turns", String(stats.turns)],
    [
      "Tokens",
      `${stats.inputTokens.toLocaleString()} in · ${stats.outputTokens.toLocaleString()} out`,
    ],
    ["Compactions", String(stats.compactions)],
  ];
  return (
    <div {...stylex.props(styles.footer)}>
      {items.map(([label, value]) => (
        <span key={label}>
          {label} <span {...stylex.props(styles.footerValue)}>{value}</span>
        </span>
      ))}
    </div>
  );
};

const runLabel = (run: TraceRun, runId: string): string => {
  const input = (run.events[0]?.submission as { input?: AgentMessage } | undefined)?.input;
  const time = run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : runId;
  const text = input ? contentText(input).slice(0, 48) : runId;
  return `${time} · ${text} · ${run.outcome ?? "incomplete"}`;
};

export const ChatPageTracePanel = ({
  sessionId,
  inputMessageId,
}: {
  sessionId: string;
  /** Opens the Run that took this user message; the latest Run otherwise. */
  inputMessageId?: string;
}) => {
  const [runs, setRuns] = useState<Array<{ runId: string; run: TraceRun }>>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState<TimelineScale>("duration");
  const live = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(sessionId, listener), [sessionId]),
    useCallback(() => getSnapshot(sessionId), [sessionId]),
  );
  const followed = useRef<{ runId?: string; readAt: number }>({ readAt: 0 });
  const rowsRef = useRef<HTMLDivElement>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // ponytail: reads every Run of the session to order the picker by start time; add a
    // summary command to the worker if sessions grow long enough for this to be slow.
    void listTraceRuns(sessionId)
      .then((ids) =>
        Promise.all(
          ids.map(async (id) => ({ runId: id, run: readRun(await readTrace(sessionId, id)) })),
        ),
      )
      .then((loaded) => {
        if (cancelled) return;
        loaded.sort((a, b) => (b.run.startedAt ?? 0) - (a.run.startedAt ?? 0));
        setRuns(loaded);
        setRunId(
          (inputMessageId ? runForInput(loaded, inputMessageId) : undefined) ??
            loaded[0]?.runId ??
            null,
        );
        setSelected(null);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : preview(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, inputMessageId]);

  // Follows the active Run by re-reading its Trace as the session snapshot changes, at most once
  // a second, and once more after it settles.
  const activeRunId = live.activeRunId;
  useEffect(() => {
    const follow = followed.current;
    if (activeRunId) follow.runId = activeRunId;
    const target = follow.runId;
    if (!target) return;
    const timer = setTimeout(
      () => {
        follow.readAt = Date.now();
        if (!activeRunId) follow.runId = undefined;
        void readTrace(sessionId, target)
          .then((events) => {
            const run = readRun(events);
            setRuns((current) =>
              current.some((item) => item.runId === target)
                ? current.map((item) => (item.runId === target ? { runId: target, run } : item))
                : [{ runId: target, run }, ...current],
            );
            setRunId((current) => current ?? target);
          })
          // Nothing written yet; the next snapshot tries again.
          .catch(() => {});
      },
      Math.max(0, follow.readAt + LIVE_READ_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [sessionId, activeRunId, live.revision]);

  const run = runs.find((item) => item.runId === runId)?.run;
  const rows = useMemo(() => (run ? toRows(run.events) : []), [run]);
  const bars = useMemo(() => (run ? layoutTimeline(run, scale) : []), [run, scale]);
  const selectedRow = rows.find((row) => row.event.sequence === selected) ?? rows[0];
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? rows.filter((row) => `${row.label} ${row.line} ${row.result}`.toLowerCase().includes(needle))
    : rows;

  const handleExport = useCallback(() => {
    if (!runId) return;
    void exportTrace(sessionId, runId)
      .then((text) => {
        const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${runId}.trace.jsonl`;
        anchor.click();
        URL.revokeObjectURL(url);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : preview(reason)),
      );
  }, [runId, sessionId]);

  const handleClear = useCallback(() => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    void clearTraces()
      .then(() => {
        setRuns([]);
        setRunId(null);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : preview(reason)),
      );
  }, [confirmingClear]);

  const selectFromTimeline = useCallback((sequence: number) => {
    setSelected(sequence);
    setQuery("");
    requestAnimationFrame(() =>
      rowsRef.current
        ?.querySelector(`[data-sequence="${sequence}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }, []);

  const startedAt = run?.startedAt ?? 0;
  const turnOf = useMemo(
    () =>
      new Map(
        (run?.turns ?? []).flatMap((group) =>
          group.events.map((event) => [event.sequence, group.turn] as const),
        ),
      ),
    [run],
  );

  return (
    <section {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.picker)}>
          <Select
            value={runId}
            onValueChange={(value) => {
              setRunId(value);
              setSelected(null);
            }}
            options={runs.map((item) => ({
              value: item.runId,
              label: runLabel(item.run, item.runId),
            }))}
            placeholder="No Runs recorded"
          />
        </div>
        <TabSelect
          aria-label="Timeline scale"
          value={scale}
          onValueChange={setScale}
          options={SCALE_OPTIONS}
        />
        <div {...stylex.props(styles.search)}>
          <Input
            type="search"
            placeholder="Search"
            aria-label="Search events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button onClick={handleExport} disabled={!runId}>
          Export JSON
        </Button>
        <Button
          variant="destructive"
          onClick={handleClear}
          onBlur={() => setConfirmingClear(false)}
        >
          {confirmingClear ? "Click again to clear" : "Clear all traces"}
        </Button>
      </div>
      {error ? <p {...stylex.props(styles.empty)}>{error}</p> : null}
      {run && selectedRow ? (
        <Timeline
          bars={bars}
          rows={rows}
          selected={selectedRow.event.sequence}
          onSelect={selectFromTimeline}
        />
      ) : null}
      {run && selectedRow ? (
        <div {...stylex.props(styles.split)}>
          <div ref={rowsRef} {...stylex.props(styles.rows)}>
            {visible.length ? null : <p {...stylex.props(styles.empty)}>No events match.</p>}
            {visible.map((row, index) => {
              const rowTurn = turnOf.get(row.event.sequence) ?? 0;
              const previous = visible[index - 1];
              const head =
                !previous || turnOf.get(previous.event.sequence) !== rowTurn ? (
                  <div {...stylex.props(styles.turnHead)}>
                    {rowTurn ? `Turn ${rowTurn}` : "Before the first model call"}
                  </div>
                ) : null;
              return (
                <div key={row.event.sequence}>
                  {head}
                  <button
                    type="button"
                    data-sequence={row.event.sequence}
                    onClick={() => setSelected(row.event.sequence)}
                    {...stylex.props(styles.row, row === selectedRow && styles.rowSelected)}
                  >
                    <span {...stylex.props(styles.chip, styles[row.kind])}>{row.label}</span>
                    <span {...stylex.props(styles.line)}>
                      {row.line}
                      {row.result ? (
                        <>
                          <span {...stylex.props(styles.arrow)}>→</span>
                          <span {...stylex.props(styles.result)}>{row.result}</span>
                        </>
                      ) : null}
                    </span>
                    <span {...stylex.props(styles.time)}>
                      {((row.event.timestamp - startedAt) / 1000).toFixed(2)}
                    </span>
                  </button>
                </div>
              );
            })}
            {run.complete ? null : (
              <p {...stylex.props(styles.hint, styles.empty)}>
                This Trace has no end: the Run is still going, or its worker stopped.
              </p>
            )}
          </div>
          <Detail key={selectedRow.event.sequence} run={run} row={selectedRow} />
        </div>
      ) : error ? null : (
        <p {...stylex.props(styles.empty)}>No Runs recorded for this session yet.</p>
      )}
      {run ? (
        <Footer
          run={run}
          status={run.outcome ?? (runId === activeRunId ? "running" : "incomplete")}
        />
      ) : null}
    </section>
  );
};
