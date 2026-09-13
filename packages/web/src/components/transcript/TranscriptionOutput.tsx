import { motion } from "motion/react";
import { useEffect, useRef } from "react";

interface TranscriptionOutputProps {
  accumulatedText: string;
  currentSegmentPrefix: string;
  currentSegment: string;
  tps: number | null;
}

const splitChars = (text: string) => Array.from(text);

export const TranscriptionOutput = ({
  accumulatedText,
  currentSegmentPrefix,
  currentSegment,
  tps,
}: TranscriptionOutputProps) => {
  const visibleAccumulatedText = currentSegment ? currentSegmentPrefix : accumulatedText;
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ block: "end" });
  }, [visibleAccumulatedText, currentSegment]);

  return (
    <div className="relative h-full min-h-0">
      <div className="h-full overflow-y-auto px-1 py-2 text-base leading-relaxed text-zinc-900 whitespace-pre-wrap md:px-2 md:py-3">
        {visibleAccumulatedText || currentSegment ? (
          <>
            {visibleAccumulatedText && <span>{visibleAccumulatedText}</span>}
            {currentSegment && (
              <span className="text-zinc-500 italic">
                {visibleAccumulatedText ? " " : ""}
                {splitChars(currentSegment).map((char, index) => (
                  <motion.span
                    key={index}
                    initial={{ opacity: 0, filter: "blur(6px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                    {char}
                  </motion.span>
                ))}
              </span>
            )}
          </>
        ) : (
          <span className="italic text-zinc-400">Start recording to see transcription...</span>
        )}
        <div ref={scrollEndRef} />
      </div>
      {tps && (
        <span className="absolute bottom-4 right-4 rounded-full border border-zinc-200 bg-[rgba(250,248,243,0.92)] px-2.5 py-1 text-xs text-zinc-500 shadow-sm tabular-nums backdrop-blur-sm">
          {tps.toFixed(2)} tok/s
        </span>
      )}
    </div>
  );
};
