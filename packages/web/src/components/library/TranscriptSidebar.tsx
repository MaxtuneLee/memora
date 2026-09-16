import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { RecordingWord } from "@/types/library";
import { formatDuration } from "@/lib/format";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });
const styles = stylex.create({
  word: {
    borderRadius: 6,
    cursor: "pointer",
    display: "inline-block",
    paddingBlock: 2,
    paddingInline: 2,
    transition:
      "color 200ms var(--ease-out-quart), background-color 200ms var(--ease-out-quart), opacity 200ms var(--ease-out-quart)",
  },
  activeWord: {
    backgroundColor: "var(--color-memora-surface-muted)",
    color: "var(--color-memora-text-strong)",
    fontWeight: 500,
  },
  pastWord: {
    color: "var(--color-memora-text)",
    ":hover": { backgroundColor: "var(--color-memora-surface-soft)" },
  },
  futureWord: {
    color: "var(--color-memora-text-soft)",
    ":hover": {
      backgroundColor: "var(--color-memora-surface-soft)",
      color: "var(--color-memora-text-muted)",
    },
  },
  centered: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    height: "100%",
    justifyContent: "center",
    paddingInline: 24,
  },
  spinner: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: spin,
    border: "2px solid var(--color-memora-border)",
    borderRadius: 9999,
    borderTopColor: "var(--color-memora-olive)",
    height: 24,
    width: 24,
  },
  textCenter: { textAlign: "center" },
  title: { color: "var(--color-memora-text)", fontSize: 14, fontWeight: 500, margin: 0 },
  detail: { color: "var(--color-memora-text-soft)", fontSize: 12, marginTop: 4 },
  progress: {
    backgroundColor: "var(--color-memora-border)",
    borderRadius: 9999,
    height: 4,
    marginInline: "auto",
    marginTop: 12,
    overflow: "hidden",
    width: 128,
  },
  progressFill: {
    backgroundColor: "var(--color-memora-olive)",
    borderRadius: 9999,
    height: "100%",
    transition: "width 300ms",
  },
  empty: {
    alignItems: "center",
    display: "flex",
    height: "100%",
    justifyContent: "center",
    paddingInline: 24,
  },
  reading: {
    height: "100%",
    overflowY: "auto",
    paddingBlock: 24,
    paddingInline: 20,
    "@media (min-width: 768px)": { paddingBlock: 32, paddingInline: 24 },
  },
  plainText: {
    color: "var(--color-memora-text-muted)",
    fontSize: 14,
    lineHeight: 2,
    margin: 0,
    width: "100%",
  },
  transcript: {
    height: "100%",
    overflowY: "auto",
    paddingBlockEnd: 0,
    paddingInline: 16,
    "@media (min-width: 768px)": { paddingInline: 20 },
  },
  header: {
    backgroundColor: "var(--color-memora-surface-soft)",
    marginBottom: 0,
    paddingBlockEnd: 16,
    paddingBlockStart: 12,
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerRow: { alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" },
  headerText: { minWidth: 0 },
  hint: {
    alignItems: "center",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    fontSize: 12,
    gap: 8,
    margin: 0,
  },
  dot: {
    backgroundColor: "var(--color-memora-olive-soft)",
    borderRadius: 9999,
    height: 6,
    width: 6,
  },
  timestamp: {
    color: "var(--color-memora-text-soft)",
    flexShrink: 0,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  content: { color: "var(--color-memora-text)", fontSize: 16, lineHeight: 1.95, width: "100%" },
});

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
              {...stylex.props(
                styles.word,
                isActive ? styles.activeWord : isPast ? styles.pastWord : styles.futureWord,
              )}
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
      <div {...stylex.props(styles.centered)}>
        <div {...stylex.props(styles.spinner)} />
        <div {...stylex.props(styles.textCenter)}>
          <p {...stylex.props(styles.title)}>Transcribing...</p>
          <p {...stylex.props(styles.detail)}>
            {transcriptionStatus === "loading-model" && "Loading AI model..."}
            {transcriptionStatus === "decoding" && "Decoding audio..."}
            {transcriptionStatus === "transcribing" && "Processing speech..."}
            {transcriptionStatus === "saving" && "Saving transcript..."}
          </p>
          <div {...stylex.props(styles.progress)}>
            <div
              {...stylex.props(styles.progressFill)}
              style={{ width: `${transcriptionProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (words.length === 0 && !text) {
    return (
      <div {...stylex.props(styles.empty)}>
        <div {...stylex.props(styles.textCenter)}>
          <p {...stylex.props(styles.title)}>No transcript yet</p>
          <p {...stylex.props(styles.detail)}>
            Generate one or add a manual draft to review it here.
          </p>
        </div>
      </div>
    );
  }

  if (words.length === 0 && text) {
    return (
      <div ref={scrollRef} className={`memora-scrollbar ${stylex.props(styles.reading).className}`}>
        <p {...stylex.props(styles.plainText)}>{text}</p>
      </div>
    );
  }

  const activeChunkIdx = activeWordIndex >= 0 ? Math.floor(activeWordIndex / CHUNK_SIZE) : -1;
  const activeWord = activeWordIndex >= 0 ? words[activeWordIndex] : null;

  return (
    <div
      ref={scrollRef}
      data-surface="transcript-reading-pane"
      className={`memora-scrollbar ${stylex.props(styles.transcript).className}`}
    >
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerRow)}>
          <div {...stylex.props(styles.headerText)}>
            <p {...stylex.props(styles.hint)}>
              <span className={`memora-hint-dot ${stylex.props(styles.dot).className}`} />
              Tap any word to jump through the recording.
            </p>
          </div>
          <div {...stylex.props(styles.timestamp)}>
            {activeWord ? formatDuration(activeWord.timestamp[0]) : "0:00"}
          </div>
        </div>
      </div>

      <div {...stylex.props(styles.content)}>
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
