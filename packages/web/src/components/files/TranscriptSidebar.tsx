import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecordingWord } from "@/lib/files";

interface TranscriptSidebarProps {
  words: RecordingWord[];
  text?: string;
  timeRef: React.RefObject<number>;
  onSeek: (time: number) => void;
  isTranscribing?: boolean;
  transcriptionStatus?: string;
  transcriptionProgress?: number;
}

const CHUNK_SIZE = 200;

const findActiveIndex = (words: RecordingWord[], time: number) => {
  for (let i = words.length - 1; i >= 0; i--) {
    if (time >= words[i].timestamp[0]) return i;
  }
  return -1;
};

interface SidebarChunkProps {
  chunk: RecordingWord[];
  baseIdx: number;
  activeWordIndex: number;
  allPast: boolean;
  onSeek: (time: number) => void;
  activeWordRef?: React.RefObject<HTMLSpanElement | null>;
}

const SidebarChunk = memo(
  ({ chunk, baseIdx, activeWordIndex, allPast, onSeek, activeWordRef }: SidebarChunkProps) => {
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
          const isActive = i === activeWordIndex;
          const isPast = allPast || i < activeWordIndex;

          return (
            <span
              key={`${word.timestamp[0]}-${i}`}
              ref={isActive ? activeWordRef : undefined}
              onClick={() => onSeek(word.timestamp[0])}
              className={`cursor-pointer rounded-sm transition-all duration-200 ${
                isActive
                  ? "text-[0.8125rem] font-semibold text-zinc-950"
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
            >
              {word.text}
            </span>
          );
        })}
      </span>
    );
  },
);

export const TranscriptSidebar = ({
  words,
  text,
  timeRef,
  onSeek,
  isTranscribing = false,
  transcriptionStatus,
  transcriptionProgress = 0,
}: TranscriptSidebarProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);

  const chunks = useMemo(() => {
    const result: RecordingWord[][] = [];
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      result.push(words.slice(i, i + CHUNK_SIZE));
    }
    return result;
  }, [words]);

  useEffect(() => {
    if (words.length === 0) return;

    let rafId: number;
    let prevIndex = -1;

    const tick = () => {
      const t = timeRef.current;
      const idx = findActiveIndex(words, t);
      if (idx !== prevIndex) {
        prevIndex = idx;
        setActiveWordIndex(idx);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [words, timeRef]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      userScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 3000);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleScroll, { passive: true });
    container.addEventListener("touchmove", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleScroll);
      container.removeEventListener("touchmove", handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const scrollToActive = useCallback(() => {
    if (userScrollingRef.current) return;
    if (!activeWordRef.current || !scrollRef.current) return;

    const container = scrollRef.current;
    const el = activeWordRef.current;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const targetScroll =
      el.offsetTop - container.offsetTop - containerRect.height / 2 + elRect.height / 2;

    container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    scrollToActive();
  }, [activeWordIndex, scrollToActive]);

  if (isTranscribing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <div className="size-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-700">Transcribing...</p>
          <p className="mt-1 text-xs text-zinc-400">
            {transcriptionStatus === "loading-model" && "Loading AI model..."}
            {transcriptionStatus === "decoding" && "Decoding audio..."}
            {transcriptionStatus === "transcribing" && "Processing speech..."}
            {transcriptionStatus === "saving" && "Saving transcript..."}
          </p>
          <div className="mt-3 mx-auto h-1 w-32 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-zinc-600 transition-all duration-300"
              style={{ width: `${transcriptionProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (words.length === 0 && !text) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-sm text-zinc-300">No transcript</p>
      </div>
    );
  }

  if (words.length === 0 && text) {
    return (
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-6 py-8 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-200"
      >
        <p className="text-xs leading-relaxed text-zinc-500">{text}</p>
      </div>
    );
  }

  const activeChunkIdx = activeWordIndex >= 0 ? Math.floor(activeWordIndex / CHUNK_SIZE) : -1;

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-5 py-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-200"
    >
      <div className="text-xs leading-[1.8]">
        {chunks.map((chunk, chunkIdx) => (
          <SidebarChunk
            key={chunkIdx}
            chunk={chunk}
            baseIdx={chunkIdx * CHUNK_SIZE}
            activeWordIndex={chunkIdx === activeChunkIdx ? activeWordIndex : -1}
            allPast={activeChunkIdx >= 0 && chunkIdx < activeChunkIdx}
            onSeek={onSeek}
            activeWordRef={chunkIdx === activeChunkIdx ? activeWordRef : undefined}
          />
        ))}
      </div>
    </div>
  );
};
