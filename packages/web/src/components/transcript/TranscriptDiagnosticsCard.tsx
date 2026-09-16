import * as stylex from "@stylexjs/stylex";

import type { TranscriptDiagnostics, TranscriptDiagnosticsIssueCode } from "@/types/library";

const styles = stylex.create({
  metric: { borderTop: "1px solid var(--color-memora-border-soft)", paddingTop: 10 },
  metricLabel: {
    color: "var(--color-memora-text-soft)",
    fontSize: "11px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  metricValue: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 600,
    marginTop: 6,
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  headerCopy: { minWidth: 0 },
  eyebrow: {
    color: "var(--color-memora-text-soft)",
    fontSize: "11px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  description: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: 1.5,
    marginTop: 8,
    maxWidth: "42rem",
  },
  status: { fontSize: "0.75rem", fontWeight: 500 },
  warningStatus: { color: "var(--color-memora-warning-text)" },
  successStatus: { color: "var(--color-memora-olive)" },
  grid: {
    display: "grid",
    columnGap: 24,
    marginTop: 16,
    rowGap: 8,
    "@media (min-width: 640px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    "@media (min-width: 1280px)": { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
  },
  issues: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 },
  issue: { color: "var(--color-memora-text-muted)", fontSize: "11px" },
});

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
    <div className={`memora-motion-enter ${stylex.props(styles.metric).className}`}>
      <div {...stylex.props(styles.metricLabel)}>{label}</div>
      <div {...stylex.props(styles.metricValue)}>{value}</div>
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
  const statusTone = diagnostics.dropped ? styles.warningStatus : styles.successStatus;

  return (
    <section>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerCopy)}>
          <div {...stylex.props(styles.eyebrow)}>{title}</div>
          <p {...stylex.props(styles.description)}>
            Heuristic quality signals for debugging transcript output. These are guide rails, not a
            model loss value.
          </p>
        </div>
        <div {...stylex.props(styles.status, statusTone)}>{statusLabel}</div>
      </div>

      <div {...stylex.props(styles.grid)}>
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
        <div {...stylex.props(styles.issues)}>
          {diagnostics.issues.map((issue) => (
            <span key={issue} {...stylex.props(styles.issue)}>
              {ISSUE_LABELS[issue]}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
};
