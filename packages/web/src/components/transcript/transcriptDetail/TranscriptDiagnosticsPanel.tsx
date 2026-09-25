import * as stylex from "@stylexjs/stylex";

import { TranscriptDiagnosticsCard } from "@/components/transcript/TranscriptDiagnosticsCard";
import type { TranscriptDiagnostics } from "@/types/library";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  panel: {
    backgroundColor: tokens.surfaceSoft,
    borderRadius: "1.5rem",
    overflow: "hidden",
    paddingBlock: 8,
    paddingInline: 16,
  },
  summary: { cursor: "pointer", listStyle: "none", paddingBlock: 8, textAlign: "left" },
  eyebrow: {
    color: tokens.textSoft,
    fontSize: "11px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  header: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 8,
  },
  title: {
    color: tokens.textStrong,
    fontSize: "1rem",
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  body: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: 1.5,
    marginTop: 4,
  },
  status: {
    color: tokens.textSoft,
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  card: { paddingTop: 16 },
});

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
      className={`memora-surface-glow ${stylex.props(styles.panel).className}`}
    >
      <summary {...stylex.props(styles.summary)}>
        <p {...stylex.props(styles.eyebrow)}>Diagnostics</p>
        <div {...stylex.props(styles.header)}>
          <div>
            <p {...stylex.props(styles.title)}>Transcript quality signals</p>
            <p {...stylex.props(styles.body)}>
              Development-only heuristics for checking transcript reliability.
            </p>
          </div>
          <span className={`memora-interactive ${stylex.props(styles.status).className}`}>
            Expand
          </span>
        </div>
      </summary>
      <div {...stylex.props(styles.card)}>
        <TranscriptDiagnosticsCard diagnostics={diagnostics} title="Transcript diagnostics" />
      </div>
    </details>
  );
};
