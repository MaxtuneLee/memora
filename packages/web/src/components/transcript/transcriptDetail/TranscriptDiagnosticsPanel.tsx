import { TranscriptDiagnosticsCard } from "@/components/transcript/TranscriptDiagnosticsCard";
import type { TranscriptDiagnostics } from "@/types/library";

interface TranscriptDiagnosticsPanelProps {
  diagnostics: TranscriptDiagnostics | undefined;
  visible: boolean;
}

export const TranscriptDiagnosticsPanel = ({
  diagnostics,
  visible,
}: TranscriptDiagnosticsPanelProps) => {
  if (!visible || !diagnostics) {
    return null;
  }

  return (
    <details
      data-surface="transcript-diagnostics-panel"
      className="memora-surface-glow group overflow-hidden rounded-[1.5rem] bg-[var(--color-memora-surface-soft)] px-4 py-2"
    >
      <summary className="cursor-pointer list-none py-2 text-left">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-memora-text-soft)]">
          Diagnostics
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold tracking-[-0.02em] text-[var(--color-memora-text-strong)]">
              Transcript quality signals
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-memora-text-muted)]">
              Development-only heuristics for checking transcript reliability.
            </p>
          </div>
          <span className="memora-interactive text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-memora-text-soft)]">
            Expand
          </span>
        </div>
      </summary>
      <div className="pt-4">
        <TranscriptDiagnosticsCard diagnostics={diagnostics} title="Transcript diagnostics" />
      </div>
    </details>
  );
};
