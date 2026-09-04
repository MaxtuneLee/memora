import { Progress as BaseProgress } from "@base-ui/react/progress";

import { cn } from "@/lib/cn";

export interface ProgressProps {
  label: string;
  value: number;
  className?: string;
  trackClassName?: string;
  indicatorClassName?: string;
}

export function Progress({
  label,
  value,
  className,
  trackClassName,
  indicatorClassName,
}: ProgressProps) {
  const normalizedValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;

  return (
    <BaseProgress.Root value={normalizedValue} className={cn("mb-2 space-y-1", className)}>
      <div className="flex justify-between gap-3 text-xs text-[var(--color-memora-text-muted)]">
        <BaseProgress.Label className="min-w-0 truncate">{label}</BaseProgress.Label>
        <BaseProgress.Value className="shrink-0 tabular-nums">
          {(formattedValue) => (formattedValue ? `${formattedValue}%` : "")}
        </BaseProgress.Value>
      </div>
      <BaseProgress.Track
        className={cn(
          "h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-memora-border)]",
          trackClassName,
        )}
      >
        <BaseProgress.Indicator
          className={cn(
            "h-full bg-[var(--color-memora-text-strong)] transition-[width] duration-300 ease-out",
            indicatorClassName,
          )}
        />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
