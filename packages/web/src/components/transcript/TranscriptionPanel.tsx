import { TranscriptionOutput } from "./TranscriptionOutput";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({ root: { flex: 1, minHeight: 0 } });

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
    <div {...stylex.props(styles.root)}>
      <TranscriptionOutput
        accumulatedText={accumulatedText}
        currentSegmentPrefix={currentSegmentPrefix}
        currentSegment={currentSegment}
        tps={tps}
      />
    </div>
  );
};
