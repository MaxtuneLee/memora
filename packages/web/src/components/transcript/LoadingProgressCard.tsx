import * as stylex from "@stylexjs/stylex";

import { Progress } from "@/components/ui/Progress";
import { tokens } from "../../styles/stylex.stylex";

const bounce = stylex.keyframes({
  "0%, 100%": {
    animationTimingFunction: "cubic-bezier(0.8, 0, 1, 1)",
    transform: "translateY(-25%)",
  },
  "50%": { animationTimingFunction: "cubic-bezier(0, 0, 0.2, 1)", transform: "none" },
});

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 24 },
  dotsWrap: { display: "flex", justifyContent: "center" },
  dots: { alignItems: "flex-end", display: "flex", gap: 4 },
  dot: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: bounce,
    backgroundColor: tokens.textStrong,
    borderRadius: 9999,
    height: 16,
    width: 16,
  },
  firstDot: { animationDelay: "-0.2s" },
  secondDot: { animationDelay: "-0.1s" },
  message: { color: tokens.textMuted, fontSize: "0.875rem", textAlign: "center" },
  progressList: { display: "flex", flexDirection: "column", gap: 8 },
});

interface ProgressItem {
  file: string;
  progress: number;
  total?: number;
}

interface LoadingProgressCardProps {
  loadingMessage: string;
  progressItems: ProgressItem[];
}

export const LoadingProgressCard = ({
  loadingMessage,
  progressItems,
}: LoadingProgressCardProps) => {
  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.dotsWrap)}>
        <div {...stylex.props(styles.dots)}>
          <span {...stylex.props(styles.dot, styles.firstDot)} />
          <span {...stylex.props(styles.dot, styles.secondDot)} />
          <span {...stylex.props(styles.dot)} />
        </div>
      </div>
      <p {...stylex.props(styles.message)}>{loadingMessage}</p>
      <div {...stylex.props(styles.progressList)}>
        {progressItems.map(({ file, progress }, i) => (
          <Progress key={i} label={file} value={progress} />
        ))}
      </div>
    </div>
  );
};
