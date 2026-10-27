import type { JSX } from "react";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "../../../styles/stylex.stylex";

const shimmer = stylex.keyframes({
  "0%, 100%": { opacity: 0.45 },
  "50%": { opacity: 1 },
});

const reducedShimmer = stylex.keyframes({
  "0%, 100%": { opacity: 0.8 },
  "50%": { opacity: 1 },
});

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    height: "100%",
    minHeight: 128,
    padding: 16,
  },
  block: {
    animationDuration: "1.8s",
    animationIterationCount: "infinite",
    animationName: shimmer,
    animationTimingFunction: "cubic-bezier(0.77, 0, 0.175, 1)",
    "@media (prefers-reduced-motion: reduce)": { animationName: reducedShimmer },
  },
  title: {
    backgroundColor: `color-mix(in srgb, ${tokens.border} 80%, transparent)`,
    borderRadius: 9999,
    flexShrink: 0,
    height: 10,
    width: "38%",
  },
  surface: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${tokens.surfaceMuted} 92%, transparent), color-mix(in srgb, ${tokens.card} 98%, transparent))`,
    border: `1px solid ${tokens.border}`,
    borderRadius: 16,
    flexGrow: 1,
    minHeight: 48,
  },
  actions: { display: "flex", flexShrink: 0, gap: 8 },
  firstAction: {
    backgroundColor: `color-mix(in srgb, ${tokens.border} 80%, transparent)`,
    borderRadius: 12,
    height: 28,
    width: 88,
  },
  secondAction: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: 12,
    height: 28,
    width: 72,
  },
  // Read by screen readers; the skeleton itself is decoration.
  srOnly: {
    border: 0,
    clip: "rect(0 0 0 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    width: 1,
  },
});

// A skeleton shaped like a typical widget. It fills the space the widget will take (the frame
// reserves its last measured height), so the swap to the real widget does not move anything.
export function GeneratedWidgetLoadingState(): JSX.Element {
  return (
    <div role="status" {...stylex.props(styles.root)}>
      <span {...stylex.props(styles.srOnly)}>Loading widget…</span>
      <div aria-hidden="true" {...stylex.props(styles.title, styles.block)} />
      <div aria-hidden="true" {...stylex.props(styles.surface, styles.block)} />
      <div aria-hidden="true" {...stylex.props(styles.actions)}>
        <div {...stylex.props(styles.firstAction, styles.block)} />
        <div {...stylex.props(styles.secondAction, styles.block)} />
      </div>
    </div>
  );
}
