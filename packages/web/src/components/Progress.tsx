import { Progress as BaseProgress } from "@base-ui/react/progress";

interface ProgressProps {
  text: string;
  percentage: number;
  total?: number;
}

export function Progress({ text, percentage }: ProgressProps) {
  const value = Number.isFinite(percentage) ? percentage : null;

  return (
    <BaseProgress.Root value={value} className="mb-2 space-y-1">
      <div className="flex justify-between text-xs text-zinc-600">
        <BaseProgress.Label className="truncate">{text}</BaseProgress.Label>
        <BaseProgress.Value className="tabular-nums">
          {(formattedValue) => (formattedValue ? `${formattedValue}%` : "")}
        </BaseProgress.Value>
      </div>
      <BaseProgress.Track className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
        <BaseProgress.Indicator className="h-full bg-zinc-900 transition-[width] duration-300 ease-out" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
