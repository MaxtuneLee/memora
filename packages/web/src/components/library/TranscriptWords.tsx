import { memo, useMemo } from "react";
import type { RecordingWord } from "@/types/library";

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
              className={`cursor-pointer rounded-sm transition-all duration-200 ${
                isActive
                  ? "text-[1.25rem] font-semibold text-zinc-950"
                  : isPast
                    ? "text-zinc-950"
                    : "text-zinc-950/30 hover:text-zinc-950/50"
              }`}
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
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
        Transcript will appear here once processing completes.
      </div>
    );
  }

  const activeChunkIdx = activeWordIndex >= 0 ? Math.floor(activeWordIndex / CHUNK_SIZE) : -1;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
        <span>{words.length} words</span>
        <span>Click a word to jump</span>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <div className="text-base leading-[1.8]">
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
