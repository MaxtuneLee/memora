import { useEffect, useRef } from "react";

interface TranscriptionOutputProps {
  accumulatedText: string;
  currentSegmentPrefix: string;
  currentSegment: string;
  tps: number | null;
}

export const TranscriptionOutput = ({
  accumulatedText,
  currentSegmentPrefix,
  currentSegment,
  tps,
}: TranscriptionOutputProps) => {
  const visibleAccumulatedText = currentSegment ? currentSegmentPrefix : accumulatedText;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [visibleAccumulatedText, currentSegment]);

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto px-1 py-2 text-base leading-relaxed text-zinc-900 whitespace-pre-wrap md:px-2 md:py-3"
      >
        {visibleAccumulatedText || currentSegment ? (
          <>
            {visibleAccumulatedText && <span>{visibleAccumulatedText}</span>}
            {currentSegment && (
              <span className="text-zinc-500 italic">
                {visibleAccumulatedText ? " " : ""}
                {currentSegment}
              </span>
            )}
          </>
        ) : (
          <span className="italic text-zinc-400">Start recording to see transcription...</span>
        )}
      </div>
      {tps && (
        <span className="absolute bottom-4 right-4 rounded-full border border-zinc-200 bg-[rgba(250,248,243,0.92)] px-2.5 py-1 text-xs text-zinc-500 shadow-sm tabular-nums backdrop-blur-sm">
          {tps.toFixed(2)} tok/s
        </span>
      )}
    </div>
  );
};
