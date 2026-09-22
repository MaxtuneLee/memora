import { memo, useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import type { RecordingWord } from "@/types/library";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  word: { borderRadius: 2, cursor: "pointer", transition: "all 200ms" },
  active: { color: tokens.textStrong, fontSize: "1.25rem", fontWeight: 600 },
  past: { color: tokens.textStrong },
  future: {
    color: `color-mix(in srgb, ${tokens.textStrong} 30%, transparent)`,
    ":hover": { color: `color-mix(in srgb, ${tokens.textStrong} 50%, transparent)` },
  },
  empty: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 8,
    color: tokens.textMuted,
    fontSize: 14,
    padding: 16,
  },
  root: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
  },
  header: {
    alignItems: "center",
    color: tokens.textSoft,
    display: "flex",
    fontSize: 12,
    justifyContent: "space-between",
    marginBottom: 12,
  },
  scroll: { maxHeight: 384, overflowY: "auto" },
  words: { fontSize: 16, lineHeight: 1.8 },
});

interface TranscriptWordsProps {
  words: RecordingWord[];
  currentTime: number;
  onSeek: (time: number) => void;
}

const CHUNK_SIZE = 200;

interface WordsChunkProps {
  chunk: RecordingWord[];
  baseIdx: number;
  activeWordIndex: number;
  allPast: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
}

const WordsChunk = memo(
  ({ chunk, baseIdx, activeWordIndex, allPast, currentTime, onSeek }: WordsChunkProps) => {
    return (
      <span
        style={
          activeWordIndex < 0 && !allPast
            ? { contentVisibility: "auto", containIntrinsicSize: "auto 500px" }
            : undefined
        }
      >
        {chunk.map((word, j) => {
          const i = baseIdx + j;
          const isActive = currentTime >= word.timestamp[0] && currentTime <= word.timestamp[1];
          const isPast = allPast || currentTime > word.timestamp[1];

          return (
            <span
              key={`${word.timestamp[0]}-${i}`}
              onClick={() => onSeek(word.timestamp[0])}
              {...stylex.props(
                styles.word,
                isActive ? styles.active : isPast ? styles.past : styles.future,
              )}
              style={
                isActive
                  ? {
                      textShadow: "0 0 8px rgba(0,0,0,0.15), 0 0 2px rgba(0,0,0,0.1)",
                    }
                  : undefined
              }
              title={`${word.timestamp[0].toFixed(2)} → ${word.timestamp[1].toFixed(2)}`}
            >
              {word.text}
            </span>
          );
        })}
      </span>
    );
  },
);

export const TranscriptWords = ({ words, currentTime, onSeek }: TranscriptWordsProps) => {
  const activeWordIndex = useMemo(() => {
    for (let i = words.length - 1; i >= 0; i--) {
      if (currentTime >= words[i].timestamp[0]) return i;
    }
    return -1;
  }, [words, currentTime]);

  const chunks = useMemo(() => {
    const result: RecordingWord[][] = [];
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      result.push(words.slice(i, i + CHUNK_SIZE));
    }
    return result;
  }, [words]);

  if (words.length === 0) {
    return (
      <div {...stylex.props(styles.empty)}>
        Transcript will appear here once processing completes.
      </div>
    );
  }

  const activeChunkIdx = activeWordIndex >= 0 ? Math.floor(activeWordIndex / CHUNK_SIZE) : -1;

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.header)}>
        <span>{words.length} words</span>
        <span>Click a word to jump</span>
      </div>
      <div {...stylex.props(styles.scroll)}>
        <div {...stylex.props(styles.words)}>
          {chunks.map((chunk, chunkIdx) => (
            <WordsChunk
              key={chunkIdx}
              chunk={chunk}
              baseIdx={chunkIdx * CHUNK_SIZE}
              activeWordIndex={chunkIdx === activeChunkIdx ? activeWordIndex : -1}
              allPast={activeChunkIdx >= 0 && chunkIdx < activeChunkIdx}
              currentTime={chunkIdx === activeChunkIdx ? currentTime : -1}
              onSeek={onSeek}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
