import { TranscriptionOutput } from "./TranscriptionOutput";

interface TranscriptionPanelProps {
  accumulatedText: string;
  currentSegmentPrefix: string;
  currentSegment: string;
  tps: number | null;
}

export const TranscriptionPanel = ({
  accumulatedText,
  currentSegmentPrefix,
  currentSegment,
  tps,
}: TranscriptionPanelProps) => {
  return (
    <div className="min-h-0 flex-1">
      <TranscriptionOutput
        accumulatedText={accumulatedText}
        currentSegmentPrefix={currentSegmentPrefix}
        currentSegment={currentSegment}
        tps={tps}
      />
    </div>
  );
};
