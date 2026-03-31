import { motion, useReducedMotion } from "motion/react";
import type { ReactElement } from "react";

import type { RecordingItem } from "@/types/library";

import { TranscriptHistoryRow } from "./TranscriptHistoryRow";
import type { TranscriptHistoryRowState } from "./transcriptLandingState";

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
      className="memora-surface-glow overflow-hidden rounded-[1.55rem] border border-[#ebe4d8] bg-[#fffdfa] shadow-[0_1px_0_rgba(255,255,255,0.85)_inset]"
    >
      <div className="px-5 py-4">
        <h2 className="text-[17px] font-bold text-memora-text">Recent transcripts</h2>
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
        <div className="flex min-h-[16rem] items-center justify-center px-5 py-10">
          <div className="space-y-3 text-center">
            <p className="text-[1.95rem] leading-none text-[var(--color-memora-text-soft)]">
              ฅ^•ﻌ•^ฅ
            </p>
            <p className="text-sm font-semibold text-memora-text">No content yet.</p>
          </div>
        </div>
      )}
    </motion.section>
  );
}
