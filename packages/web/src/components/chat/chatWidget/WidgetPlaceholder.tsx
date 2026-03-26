import { formatStreamFootprint } from "./constants";

export const WidgetPlaceholder = ({
  title,
  detail,
  widgetCodeLength,
}: {
  title: string;
  detail: string;
  widgetCodeLength: number;
}) => {
  return (
    <div className="px-3 py-3">
      <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white/90 px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,244,245,0.95),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(250,250,249,0.92))]" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-zinc-300/80" />
                <span className="relative size-2.5 rounded-full bg-zinc-600" />
              </span>
              <p className="truncate text-sm font-medium text-zinc-900">{title}</p>
            </div>
            {widgetCodeLength > 0 && (
              <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-100/90 px-2 py-1 font-mono text-[10px] text-zinc-500">
                {formatStreamFootprint(widgetCodeLength)}
              </span>
            )}
          </div>
          <p className="text-xs leading-5 text-zinc-500">{detail}</p>
          <div className="space-y-2">
            <div className="h-2.5 w-5/12 animate-pulse rounded-full bg-zinc-200/80" />
            <div className="h-20 animate-pulse rounded-[20px] border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(244,244,245,0.92),rgba(255,255,255,0.98))]" />
            <div className="flex gap-2">
              <div className="h-8 w-24 animate-pulse rounded-xl bg-zinc-200/80" />
              <div className="h-8 w-20 animate-pulse rounded-xl bg-zinc-100" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
