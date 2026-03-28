import type { TranscriptDiagnostics, TranscriptDiagnosticsIssueCode } from "@/types/library";

const ISSUE_LABELS: Record<TranscriptDiagnosticsIssueCode, string> = {
  "blank-audio-marker": "Blank audio marker",
  "dense-output": "Dense output",
  "empty-after-cleanup": "Empty after cleanup",
  "high-repetition": "High repetition",
  "low-audio-energy": "Low audio energy",
  "low-content": "Low content",
  "repeated-tail-loop": "Repeated tail loop",
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const Metric = ({ label, value }: { label: string; value: string }) => {
  return (
    <div className="memora-motion-enter border-t border-[var(--color-memora-border-soft)] pt-2.5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-memora-text-soft)]">
        {label}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-[var(--color-memora-text)]">{value}</div>
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
    ? "text-[var(--color-memora-warning-text)]"
    : "text-[var(--color-memora-olive)]";

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-memora-text-soft)]">
            {title}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-memora-text-muted)]">
            Heuristic quality signals for debugging transcript output. These are guide rails, not a
            model loss value.
          </p>
        </div>
        <div className={`text-xs font-medium ${statusTone}`}>{statusLabel}</div>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Hallucination" value={formatPercent(diagnostics.hallucinationScore)} />
        <Metric label="Words / sec" value={diagnostics.wordsPerSecond.toFixed(2)} />
        <Metric label="Repetition" value={formatPercent(diagnostics.repetitionRatio)} />
        <Metric label="Active audio" value={formatPercent(diagnostics.activeFrameRatio)} />
        <Metric label="Audio RMS" value={diagnostics.audioRms.toFixed(4)} />
        <Metric
          label="Tail repeat"
          value={
            diagnostics.trailingRepeatPhraseWords > 0
              ? `${diagnostics.trailingRepeatPhraseWords} words`
              : "None"
          }
        />
        {typeof diagnostics.segmentCount === "number" ? (
          <Metric
            label="Segments"
            value={`${diagnostics.acceptedSegmentCount ?? 0}/${diagnostics.segmentCount}`}
          />
        ) : null}
      </div>

      {diagnostics.issues.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {diagnostics.issues.map((issue) => (
            <span key={issue} className="text-[11px] text-[var(--color-memora-text-muted)]">
              {ISSUE_LABELS[issue]}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
};
