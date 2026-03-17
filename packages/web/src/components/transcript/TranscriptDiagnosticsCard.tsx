import type {
  TranscriptDiagnostics,
  TranscriptDiagnosticsIssueCode,
} from "@/types/library";

const ISSUE_LABELS: Record<TranscriptDiagnosticsIssueCode, string> = {
  "blank-audio-marker": "Blank audio marker",
  "empty-after-cleanup": "Empty after cleanup",
  "low-content": "Low content",
  "low-audio-energy": "Low audio energy",
  "high-repetition": "High repetition",
  "repeated-tail-loop": "Repeated tail loop",
  "dense-output": "Dense output",
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const Metric = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white/80 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-800">{value}</div>
    </div>
  );
};

interface TranscriptDiagnosticsCardProps {
  diagnostics: TranscriptDiagnostics | null | undefined;
  title: string;
}

export const TranscriptDiagnosticsCard = ({
  diagnostics,
  title,
}: TranscriptDiagnosticsCardProps) => {
  if (!diagnostics) {
    return null;
  }

  const statusLabel = diagnostics.dropped
    ? `Filtered: ${ISSUE_LABELS[diagnostics.dropReason ?? "empty-after-cleanup"]}`
    : `Quality ${formatPercent(diagnostics.qualityScore)}`;
  const statusTone = diagnostics.dropped
    ? "border-amber-300 bg-amber-50 text-amber-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-[rgba(250,248,243,0.88)] p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            {title}
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Heuristic quality signals for debugging. This is not Whisper&apos;s
            true loss.
          </p>
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone}`}
        >
          {statusLabel}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Metric
          label="Hallucination"
          value={formatPercent(diagnostics.hallucinationScore)}
        />
        <Metric
          label="Words / sec"
          value={diagnostics.wordsPerSecond.toFixed(2)}
        />
        <Metric
          label="Repetition"
          value={formatPercent(diagnostics.repetitionRatio)}
        />
        <Metric
          label="Active audio"
          value={formatPercent(diagnostics.activeFrameRatio)}
        />
        <Metric label="Audio RMS" value={diagnostics.audioRms.toFixed(4)} />
        <Metric
          label="Tail repeat"
          value={
            diagnostics.trailingRepeatPhraseWords > 0
              ? `${diagnostics.trailingRepeatPhraseWords} words`
              : "None"
          }
        />
        {typeof diagnostics.segmentCount === "number" && (
          <Metric
            label="Segments"
            value={`${diagnostics.acceptedSegmentCount ?? 0}/${diagnostics.segmentCount}`}
          />
        )}
      </div>

      {diagnostics.issues.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {diagnostics.issues.map((issue) => (
            <span
              key={issue}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600"
            >
              {ISSUE_LABELS[issue]}
            </span>
          ))}
        </div>
      )}
    </section>
  );
};
