import * as stylex from "@stylexjs/stylex";

import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import type { ShowWidgetDebugState } from "@/lib/chat/showWidgetDebug";
import type { ParsedShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

import { formatDebugTimestamp, formatStreamFootprint } from "./constants";

const styles = stylex.create({
  panel: {
    backgroundColor: "#09090b",
    borderTopColor: "rgba(228,228,231,0.8)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: "#f4f4f5",
  },
  summary: {
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 500,
    letterSpacing: "0.02em",
    lineHeight: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  content: { display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.75rem" },
  facts: {
    color: "#d4d4d8",
    display: "grid",
    fontSize: "11px",
    gap: "0.5rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 1024px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  muted: { color: "#71717a" },
  section: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  label: {
    color: "#71717a",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "10px",
    letterSpacing: "0.08em",
    lineHeight: "1rem",
  },
  code: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "11px",
    lineHeight: "1.25rem",
    maxHeight: "12rem",
    overflow: "auto",
    overflowWrap: "anywhere",
    padding: "0.75rem",
    whiteSpace: "pre-wrap",
  },
  amberCode: { color: "#fef3c7" },
  emeraldCode: { color: "#d1fae5", maxHeight: "16rem" },
  events: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    maxHeight: "16rem",
    overflow: "auto",
  },
  event: {
    borderBottomColor: "rgba(255,255,255,0.05)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    ":last-child": { borderBottomWidth: 0 },
  },
  eventHeader: {
    alignItems: "flex-start",
    display: "flex",
    fontSize: "11px",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  eventCopy: { minWidth: 0 },
  eventTitle: { color: "#f4f4f5", fontWeight: 500 },
  monoMuted: {
    color: "#71717a",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  timestamp: { flexShrink: 0 },
  details: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: "0.5rem",
    color: "#d4d4d8",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "10px",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
    overflow: "auto",
    overflowWrap: "anywhere",
    padding: "0.5rem",
    whiteSpace: "pre-wrap",
  },
  empty: { color: "#71717a", fontSize: "11px", paddingBlock: "0.5rem", paddingInline: "0.75rem" },
});

export const WidgetDebugPanel = ({
  widget,
  debugState,
  parsedCode,
  hasRenderableHtml,
  hasRuntimeDom,
}: {
  widget: ChatWidgetData;
  debugState: ShowWidgetDebugState;
  parsedCode: ParsedShowWidgetCode;
  hasRenderableHtml: boolean;
  hasRuntimeDom: boolean;
}) => {
  return (
    <details {...stylex.props(styles.panel)}>
      <summary {...stylex.props(styles.summary)}>Widget debug</summary>
      <div {...stylex.props(styles.content)}>
        <div {...stylex.props(styles.facts)}>
          <div>
            <span {...stylex.props(styles.muted)}>phase</span>: {widget.phase}
          </div>
          <div>
            <span {...stylex.props(styles.muted)}>args buffer</span>:{" "}
            {formatStreamFootprint(debugState.argsBuffer.length)}
          </div>
          <div>
            <span {...stylex.props(styles.muted)}>widget_code</span>:{" "}
            {formatStreamFootprint(widget.widgetCode.length)}
          </div>
          <div>
            <span {...stylex.props(styles.muted)}>style</span>:{" "}
            {parsedCode.hasStyle ? (parsedCode.styleReady ? "ready" : "streaming") : "none"}
          </div>
          <div>
            <span {...stylex.props(styles.muted)}>html</span>:{" "}
            {hasRenderableHtml
              ? `${formatStreamFootprint(parsedCode.htmlRenderable.length)} renderable`
              : parsedCode.htmlText.trim()
                ? "present but not renderable yet"
                : "empty"}
          </div>
          <div>
            <span {...stylex.props(styles.muted)}>script</span>:{" "}
            {parsedCode.hasScript ? (parsedCode.scriptReady ? "ready" : "streaming") : "none"}
          </div>
          <div>
            <span {...stylex.props(styles.muted)}>runtime dom</span>:{" "}
            {hasRuntimeDom ? "mounted" : "empty"}
          </div>
          <div>
            <span {...stylex.props(styles.muted)}>latest delta</span>:{" "}
            {formatStreamFootprint(debugState.latestDelta.length)}
          </div>
          <div>
            <span {...stylex.props(styles.muted)}>events</span>: {debugState.events.length}
          </div>
        </div>
        <div {...stylex.props(styles.section)}>
          <p {...stylex.props(styles.label)}>Raw args buffer</p>
          <pre {...stylex.props(styles.code, styles.amberCode)}>
            {debugState.argsBuffer || "(empty)"}
          </pre>
        </div>
        <div {...stylex.props(styles.section)}>
          <p {...stylex.props(styles.label)}>Extracted widget code</p>
          <pre {...stylex.props(styles.code, styles.emeraldCode)}>
            {widget.widgetCode || "(empty)"}
          </pre>
        </div>
        <div {...stylex.props(styles.section)}>
          <p {...stylex.props(styles.label)}>Recent events</p>
          <div {...stylex.props(styles.events)}>
            {debugState.events.length > 0 ? (
              debugState.events
                .slice()
                .reverse()
                .map((event, index) => (
                  <div
                    key={`${event.at}-${event.type}-${index}`}
                    className={stylex.props(styles.event).className}
                  >
                    <div {...stylex.props(styles.eventHeader)}>
                      <div {...stylex.props(styles.eventCopy)}>
                        <p {...stylex.props(styles.eventTitle)}>{event.summary}</p>
                        <p {...stylex.props(styles.monoMuted)}>{event.type}</p>
                      </div>
                      <span {...stylex.props(styles.monoMuted, styles.timestamp)}>
                        {formatDebugTimestamp(event.at)}
                      </span>
                    </div>
                    {event.details && (
                      <pre {...stylex.props(styles.details)}>
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
            ) : (
              <div {...stylex.props(styles.empty)}>No debug events yet.</div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
};
