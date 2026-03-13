import { Progress } from "@/components/Progress";

interface ProgressItem {
  file: string;
  progress: number;
  total?: number;
}

interface LoadingProgressCardProps {
  loadingMessage: string;
  progressItems: ProgressItem[];
}

export const LoadingProgressCard = ({
  loadingMessage,
  progressItems,
}: LoadingProgressCardProps) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div className="flex items-end gap-1">
          <span className="h-4 w-4 animate-bounce rounded-full bg-zinc-900 [animation-delay:-0.2s]" />
          <span className="h-4 w-4 animate-bounce rounded-full bg-zinc-900 [animation-delay:-0.1s]" />
          <span className="h-4 w-4 animate-bounce rounded-full bg-zinc-900" />
        </div>
      </div>
      <p className="text-center text-sm text-zinc-600">{loadingMessage}</p>
      <div className="space-y-2">
        {progressItems.map(({ file, progress, total }, i) => (
          <Progress key={i} text={file} percentage={progress} total={total} />
        ))}
      </div>
    </div>
  );
};
