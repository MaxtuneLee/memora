import { motion } from "motion/react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { AgentStatus } from "@/hooks/chat/useAgent";

const shimmer = stylex.keyframes({
  "0%": { backgroundPosition: "-200% 0" },
  "100%": { backgroundPosition: "200% 0" },
});
const spin = stylex.keyframes({ "100%": { transform: "rotate(360deg)" } });
const styles = stylex.create({
  root: { marginBottom: 8 },
  status: {
    alignItems: "center",
    animationDuration: "2s",
    animationIterationCount: "infinite",
    animationName: shimmer,
    backgroundImage: "linear-gradient(to right, #f4f4f5, #fafafa, #f4f4f5)",
    backgroundSize: "200% 100%",
    borderRadius: 9999,
    color: "#71717a",
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 500,
    gap: 6,
    paddingBlock: 4,
    paddingInline: 12,
    position: "relative",
    zIndex: 10,
  },
  error: { animationName: "none", backgroundColor: "#fef2f2", color: "#ef4444" },
  icon: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
    height: 12,
    width: 12,
  },
});

export function StatusBar({ status }: { status: AgentStatus }) {
  if (status.type === "idle" || status.type === "generating") return null;

  const labels: Record<string, string> = {
    thinking: "Thinking...",
    searching: "Searching the web...",
    "tool-calling": `Calling ${(status as { toolName: string }).toolName}...`,
    "tool-running": `Running ${(status as { toolName: string }).toolName}...`,
    error: "Something went wrong",
  };

  const label = labels[status.type];
  if (!label) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      {...stylex.props(styles.root)}
    >
      <div {...stylex.props(styles.status, status.type === "error" && styles.error)}>
        {status.type !== "error" && (
          <CircleNotchIcon className={stylex.props(styles.icon).className} weight="bold" />
        )}
        <span>{label}</span>
      </div>
    </motion.div>
  );
}
