import { motion } from "motion/react";
import { memo, useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  root: { height: "100%", minHeight: 0, position: "relative" },
  content: {
    color: "#18181b",
    fontSize: 16,
    height: "100%",
    lineHeight: 1.625,
    overflowY: "auto",
    paddingBlock: 8,
    paddingInline: 4,
    whiteSpace: "pre-wrap",
    "@media (min-width: 768px)": { paddingBlock: 12, paddingInline: 8 },
  },
  current: { color: "#71717a", fontStyle: "italic" },
  empty: { color: "#a1a1aa", fontStyle: "italic" },
  scrollEnd: { scrollMarginBottom: 112, "@media (min-width: 768px)": { scrollMarginBottom: 128 } },
  rate: {
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(250 248 243 / 0.92)",
    border: "1px solid #e4e4e7",
    borderRadius: 9999,
    bottom: 16,
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    color: "#71717a",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    paddingBlock: 4,
    paddingInline: 10,
    position: "absolute",
    right: 16,
  },
});

interface TranscriptionOutputProps {
  accumulatedText: string;
  currentSegmentPrefix: string;
  currentSegment: string;
  tps: number | null;
}

const splitChars = (text: string) => Array.from(text);

// Stable object references: framer-motion restarts a span's transition whenever
// initial/animate/transition change identity, so inline literals here would replay
// the fade-in for every already-settled character each time currentSegment grows.
const CHAR_INITIAL = { opacity: 0, filter: "blur(6px)" };
const CHAR_ANIMATE = { opacity: 1, filter: "blur(0px)" };
const CHAR_TRANSITION = { duration: 0.35, ease: "easeOut" } as const;

const TranscribedChar = memo(({ char }: { char: string }) => (
  <motion.span initial={CHAR_INITIAL} animate={CHAR_ANIMATE} transition={CHAR_TRANSITION}>
    {char}
  </motion.span>
));
TranscribedChar.displayName = "TranscribedChar";

// If the user scrolls up to read earlier text, stop auto-following until they've
// left it alone for a while — matches the recording playback transcript's behavior.
const AUTO_SCROLL_RESUME_MS = 5000;

export const TranscriptionOutput = ({
  accumulatedText,
  currentSegmentPrefix,
  currentSegment,
  tps,
}: TranscriptionOutputProps) => {
  const visibleAccumulatedText = currentSegment ? currentSegmentPrefix : accumulatedText;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const userScrollingRef = useRef(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // wheel/touchmove only fire from real user input, never from our own
    // scrollIntoView() calls below — unlike the generic "scroll" event, which
    // would immediately re-trigger from our own auto-scroll and permanently
    // lock it out.
    const markUserScrolling = () => {
      userScrollingRef.current = true;
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, AUTO_SCROLL_RESUME_MS);
    };

    container.addEventListener("wheel", markUserScrolling, { passive: true });
    container.addEventListener("touchmove", markUserScrolling, { passive: true });

    return () => {
      container.removeEventListener("wheel", markUserScrolling);
      container.removeEventListener("touchmove", markUserScrolling);
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  // currentSegment grows by concatenation as the word-by-word reveal plays, so
  // everything before the previous render's value has already finished its fade-in.
  // Re-rendering it as a motion.span forever would keep one compositor layer alive
  // per character (filter animations force layer promotion) for the whole segment,
  // and they'd all get torn down together the instant the segment finalizes. Only
  // the newly appended tail needs to animate; the rest downgrades to plain text.
  const previousSegmentRef = useRef("");
  const settledSegment = currentSegment.startsWith(previousSegmentRef.current)
    ? previousSegmentRef.current
    : "";
  const newSegment = currentSegment.slice(settledSegment.length);

  useEffect(() => {
    previousSegmentRef.current = currentSegment;
  }, [currentSegment]);

  useEffect(() => {
    if (userScrollingRef.current) return;
    scrollEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [visibleAccumulatedText, currentSegment]);

  return (
    <div {...stylex.props(styles.root)}>
      <div ref={containerRef} {...stylex.props(styles.content)}>
        {visibleAccumulatedText || currentSegment ? (
          <>
            {visibleAccumulatedText && <span>{visibleAccumulatedText}</span>}
            {currentSegment && (
              <span {...stylex.props(styles.current)}>
                {visibleAccumulatedText ? " " : ""}
                {settledSegment}
                {splitChars(newSegment).map((char, index) => (
                  <TranscribedChar key={settledSegment.length + index} char={char} />
                ))}
              </span>
            )}
          </>
        ) : (
          <span {...stylex.props(styles.empty)}>Start recording to see transcription...</span>
        )}
        {/* Keeps scrollIntoView from landing flush against the bottom of the page,
            where the sticky recording-control widget (~6.25rem/6.75rem tall) would
            cover the newest text. */}
        <div ref={scrollEndRef} {...stylex.props(styles.scrollEnd)} />
      </div>
      {tps && <span {...stylex.props(styles.rate)}>{tps.toFixed(2)} tok/s</span>}
    </div>
  );
};
