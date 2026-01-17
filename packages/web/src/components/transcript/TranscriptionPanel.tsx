import { TranscriptionOutput } from "./TranscriptionOutput";

interface TranscriptionPanelProps {
  accumulatedText: string;
  currentSegment: string;
  tps: number | null;
}

export const TranscriptionPanel = ({
  accumulatedText,
  currentSegment,
  tps,
}: TranscriptionPanelProps) => {
  return (
    <div>
      <TranscriptionOutput
        accumulatedText={accumulatedText}
        currentSegment={currentSegment}
        tps={tps}
      />
    </div>
  );
};
