import { motion, useReducedMotion } from "motion/react";
import type { ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";

import type { RecordingItem } from "@/types/library";

import { TranscriptHistoryRow } from "./TranscriptHistoryRow";
import type { TranscriptHistoryRowState } from "./transcriptLandingState";

const styles = stylex.create({
  root: {
    backgroundColor: "#fffdfa",
    border: "1px solid #ebe4d8",
    borderRadius: "1.55rem",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.85)",
    overflow: "hidden",
  },
  header: { paddingBlock: 16, paddingInline: 20 },
  title: { color: "var(--color-memora-text)", fontSize: "17px", fontWeight: 700 },
  empty: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    minHeight: "16rem",
    paddingBlock: 40,
    paddingInline: 20,
  },
  emptyCopy: { display: "flex", flexDirection: "column", gap: 12, textAlign: "center" },
  emptyIcon: { color: "var(--color-memora-text-soft)", fontSize: "1.95rem", lineHeight: 1 },
  emptyTitle: { color: "var(--color-memora-text)", fontSize: "0.875rem", fontWeight: 600 },
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
