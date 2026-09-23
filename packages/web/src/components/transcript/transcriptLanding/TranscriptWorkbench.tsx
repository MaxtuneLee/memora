import { motion, useReducedMotion } from "motion/react";
import type { ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";

import type { RecordingItem } from "@/types/library";

import { TranscriptHistoryRow } from "./TranscriptHistoryRow";
import type { TranscriptHistoryRowState } from "./transcriptLandingState";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.borderSoft}`,
    borderRadius: "1.55rem",
    boxShadow: tokens.shadowSmall,
    overflow: "hidden",
  },
  header: { paddingBlock: 16, paddingInline: 20 },
  title: { color: tokens.text, fontSize: "17px", fontWeight: 700 },
  empty: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    minHeight: "16rem",
    paddingBlock: 40,
    paddingInline: 20,
  },
  emptyCopy: { display: "flex", flexDirection: "column", gap: 12, textAlign: "center" },
  emptyIcon: { color: tokens.textSoft, fontSize: "1.95rem", lineHeight: 1 },
  emptyTitle: { color: tokens.text, fontSize: "0.875rem", fontWeight: 600 },
});

interface TranscriptWorkbenchItem {
  recording: RecordingItem;
  state: TranscriptHistoryRowState;
}

interface TranscriptWorkbenchProps {
  items: TranscriptWorkbenchItem[];
  onDelete: (recording: RecordingItem) => void;
}

const SECTION_EASE = [0.22, 1, 0.36, 1] as const;

export function TranscriptWorkbench({ items, onDelete }: TranscriptWorkbenchProps): ReactElement {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <motion.section
      data-surface="transcript-workbench"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducedMotion ? 0.12 : 0.28,
        ease: SECTION_EASE,
      }}
      className={`memora-surface-glow ${stylex.props(styles.root).className}`}
    >
      <div {...stylex.props(styles.header)}>
        <h2 {...stylex.props(styles.title)}>Recent transcripts</h2>
      </div>

      {items.length > 0 ? (
        <div>
          {items.map((item) => (
            <TranscriptHistoryRow
              key={item.recording.id}
              recording={item.recording}
              state={item.state}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <div {...stylex.props(styles.empty)}>
          <div {...stylex.props(styles.emptyCopy)}>
            <p {...stylex.props(styles.emptyIcon)}>ฅ^•ﻌ•^ฅ</p>
            <p {...stylex.props(styles.emptyTitle)}>No content yet.</p>
          </div>
        </div>
      )}
    </motion.section>
  );
}
