import type { JSX } from "react";
import * as stylex from "@stylexjs/stylex";

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 0.32 },
  "50%": { opacity: 1 },
});

const reducedPulse = stylex.keyframes({
  "0%, 100%": { opacity: 0.72 },
  "50%": { opacity: 1 },
});

const styles = stylex.create({
  root: {
    alignItems: "center",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    flexDirection: "column",
    fontSize: 13,
    gap: 10,
    justifyContent: "center",
    lineHeight: 1.5,
    minHeight: 128,
    padding: 16,
    textAlign: "center",
  },
  dots: { display: "flex", gap: 5 },
  dot: {
    animationDuration: "1.6s",
    animationIterationCount: "infinite",
    animationName: pulse,
    animationTimingFunction: "cubic-bezier(0.77, 0, 0.175, 1)",
    backgroundColor: "var(--color-memora-text-muted)",
    borderRadius: 9999,
    height: 5,
    width: 5,
    "@media (prefers-reduced-motion: reduce)": { animationName: reducedPulse },
  },
  firstDot: { animationDelay: "-320ms" },
  secondDot: { animationDelay: "-160ms" },
});

export function GeneratedWidgetLoadingState(): JSX.Element {
  return (
    <div role="status" {...stylex.props(styles.root)}>
      <span aria-hidden="true" {...stylex.props(styles.dots)}>
        <span {...stylex.props(styles.dot, styles.firstDot)} />
        <span {...stylex.props(styles.dot, styles.secondDot)} />
        <span {...stylex.props(styles.dot)} />
      </span>
      <span>Loading widget…</span>
    </div>
  );
}
