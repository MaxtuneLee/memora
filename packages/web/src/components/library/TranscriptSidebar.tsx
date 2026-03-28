import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecordingWord } from "@/types/library";
import { formatDuration } from "@/lib/format";

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
              className={`inline-block cursor-pointer rounded-md px-0.5 py-0.5 transition-[color,background-color,opacity] duration-200 ease-[var(--ease-out-quart)] ${
                isActive
                  ? "bg-[var(--color-memora-surface-muted)] font-medium text-[var(--color-memora-text-strong)]"
                  : isPast
                    ? "text-[var(--color-memora-text)] hover:bg-[var(--color-memora-surface-soft)]"
                    : "text-[var(--color-memora-text-soft)] hover:bg-[var(--color-memora-surface-soft)] hover:text-[var(--color-memora-text-muted)]"
              }`}
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
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-memora-border)] border-t-[var(--color-memora-olive)]" />
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--color-memora-text)]">Transcribing...</p>
          <p className="mt-1 text-xs text-[var(--color-memora-text-soft)]">
            {transcriptionStatus === "loading-model" && "Loading AI model..."}
            {transcriptionStatus === "decoding" && "Decoding audio..."}
            {transcriptionStatus === "transcribing" && "Processing speech..."}
            {transcriptionStatus === "saving" && "Saving transcript..."}
          </p>
          <div className="mx-auto mt-3 h-1 w-32 overflow-hidden rounded-full bg-[var(--color-memora-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-memora-olive)] transition-all duration-300"
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
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--color-memora-text)]">No transcript yet</p>
          <p className="mt-1 text-xs text-[var(--color-memora-text-soft)]">
            Generate one or add a manual draft to review it here.
          </p>
        </div>
      </div>
    );
  }

  if (words.length === 0 && text) {
    return (
      <div
        ref={scrollRef}
        className="memora-scrollbar h-full overflow-y-auto px-5 py-6 md:px-6 md:py-8"
      >
        <p className="w-full text-sm leading-8 text-[var(--color-memora-text-muted)]">{text}</p>
      </div>
    );
  }

  const activeChunkIdx = activeWordIndex >= 0 ? Math.floor(activeWordIndex / CHUNK_SIZE) : -1;
  const activeWord = activeWordIndex >= 0 ? words[activeWordIndex] : null;

  return (
    <div
      ref={scrollRef}
      data-surface="transcript-reading-pane"
      className="memora-scrollbar h-full overflow-y-auto px-4 pb-0 md:px-5"
    >
      <div className="sticky top-0 z-10 mb-0 bg-[var(--color-memora-surface-soft)] pt-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs text-[var(--color-memora-text-muted)]">
              <span className="memora-hint-dot inline-flex size-1.5 rounded-full bg-[var(--color-memora-olive-soft)]" />
              Tap any word to jump through the recording.
            </p>
          </div>
          <div className="shrink-0 text-xs tabular-nums text-[var(--color-memora-text-soft)]">
            {activeWord ? formatDuration(activeWord.timestamp[0]) : "0:00"}
          </div>
        </div>
      </div>

      <div className="w-full text-base leading-[1.95] text-[var(--color-memora-text)]">
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
