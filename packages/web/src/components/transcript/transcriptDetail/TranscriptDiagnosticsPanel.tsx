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
    <details className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-4 text-sm font-medium text-zinc-700 marker:hidden">
        Transcript diagnostics
      </summary>
      <div className="border-t border-zinc-200 p-4">
        <TranscriptDiagnosticsCard
          diagnostics={diagnostics}
          title="Transcript Diagnostics"
        />
      </div>
    </details>
  );
};
