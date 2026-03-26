import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import type { ShowWidgetDebugState } from "@/lib/chat/showWidgetDebug";
import type { ParsedShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

import { formatDebugTimestamp, formatStreamFootprint } from "./constants";

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
    <details className="border-t border-zinc-200/80 bg-zinc-950 text-zinc-100">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium tracking-[0.02em]">
        Widget Debug
      </summary>
      <div className="space-y-3 px-3 py-3">
        <div className="grid gap-2 text-[11px] text-zinc-300 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="text-zinc-500">phase</span>: {widget.phase}
          </div>
          <div>
            <span className="text-zinc-500">args buffer</span>:{" "}
            {formatStreamFootprint(debugState.argsBuffer.length)}
          </div>
          <div>
            <span className="text-zinc-500">widget_code</span>:{" "}
            {formatStreamFootprint(widget.widgetCode.length)}
          </div>
          <div>
            <span className="text-zinc-500">style</span>:{" "}
            {parsedCode.hasStyle ? (parsedCode.styleReady ? "ready" : "streaming") : "none"}
          </div>
          <div>
            <span className="text-zinc-500">html</span>:{" "}
            {hasRenderableHtml
              ? `${formatStreamFootprint(parsedCode.htmlRenderable.length)} renderable`
              : parsedCode.htmlText.trim()
                ? "present but not renderable yet"
                : "empty"}
          </div>
          <div>
            <span className="text-zinc-500">script</span>:{" "}
            {parsedCode.hasScript ? (parsedCode.scriptReady ? "ready" : "streaming") : "none"}
          </div>
          <div>
            <span className="text-zinc-500">runtime dom</span>:{" "}
            {hasRuntimeDom ? "mounted" : "empty"}
          </div>
          <div>
            <span className="text-zinc-500">latest delta</span>:{" "}
            {formatStreamFootprint(debugState.latestDelta.length)}
          </div>
          <div>
            <span className="text-zinc-500">events</span>: {debugState.events.length}
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Raw Args Buffer
          </p>
          <pre className="max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-amber-100 whitespace-pre-wrap break-all">
            {debugState.argsBuffer || "(empty)"}
          </pre>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Extracted Widget Code
          </p>
          <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-emerald-100 whitespace-pre-wrap break-all">
            {widget.widgetCode || "(empty)"}
          </pre>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Recent Events
          </p>
          <div className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/20">
            {debugState.events.length > 0 ? (
              debugState.events
                .slice()
                .reverse()
                .map((event, index) => (
                  <div
                    key={`${event.at}-${event.type}-${index}`}
                    className="border-b border-white/5 px-3 py-2 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-3 text-[11px]">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-100">{event.summary}</p>
                        <p className="font-mono text-zinc-500">{event.type}</p>
                      </div>
                      <span className="shrink-0 font-mono text-zinc-500">
                        {formatDebugTimestamp(event.at)}
                      </span>
                    </div>
                    {event.details && (
                      <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/20 p-2 font-mono text-[10px] leading-5 text-zinc-300">
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
            ) : (
              <div className="px-3 py-2 text-[11px] text-zinc-500">No debug events yet.</div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
};
