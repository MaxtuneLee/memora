interface TranscriptionOutputProps {
  accumulatedText: string;
  currentSegment: string;
  tps: number | null;
}

export const TranscriptionOutput = ({
  accumulatedText,
  currentSegment,
  tps,
}: TranscriptionOutputProps) => {
  return (
    <div className="relative">
      <div className="overflow-y-auto rounded-lg px-5 py-4 text-base leading-relaxed text-zinc-900 whitespace-pre-wrap">
        {accumulatedText || currentSegment ? (
          <>
            {accumulatedText && <span>{accumulatedText}</span>}
            {currentSegment && (
              <span className="text-zinc-500 italic">
                {accumulatedText ? " " : ""}
                {currentSegment}
              </span>
            )}
          </>
        ) : (
          <span className="italic text-zinc-400">
            Start recording to see transcription...
          </span>
        )}
      </div>
      {tps && (
        <span className="absolute bottom-3 right-3 rounded bg-white px-2 py-0.5 text-xs text-zinc-500 shadow-sm tabular-nums">
          {tps.toFixed(2)} tok/s
        </span>
      )}
    </div>
  );
};
