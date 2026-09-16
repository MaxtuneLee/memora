import { useState } from "react";
import {
  CircleNotchIcon,
  MagnifyingGlassIcon,
  CaretDownIcon,
  CaretRightIcon,
  GlobeIcon,
  BrainIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import * as stylex from "@stylexjs/stylex";
import type { AgentStatus, ThinkingStep } from "@/hooks/chat/useAgent";

const shimmer = stylex.keyframes({
  "0%": { backgroundPosition: "-200% 0" },
  "100%": { backgroundPosition: "200% 0" },
});

const spin = stylex.keyframes({ "100%": { transform: "rotate(360deg)" } });

const styles = stylex.create({
  root: { marginBottom: 12 },
  header: {
    alignItems: "center",
    color: "#a1a1aa",
    display: "flex",
    fontSize: 12,
    fontWeight: 500,
    gap: 6,
    transition: "color 150ms",
    ":hover": { color: "#52525b" },
  },
  headerActive: { color: "#0d9488" },
  icon: { height: 12, width: 12 },
  mutedIcon: { color: "#a1a1aa", flexShrink: 0, height: 12, width: 12 },
  activeIcon: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
    color: "#14b8a6",
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  collapse: { overflow: "hidden" },
  steps: {
    borderLeft: "2px solid #e4e4e7",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
    paddingLeft: 12,
  },
  row: { alignItems: "center", display: "flex", gap: 6 },
  reasoningRow: { alignItems: "flex-start", display: "flex", gap: 6 },
  reasoningWrap: { display: "flex", flexDirection: "column", gap: 4 },
  text: { color: "#71717a", fontSize: 12 },
  reasoningText: { color: "#71717a", fontSize: 12, lineHeight: 1.625 },
  shimmer: {
    animationDuration: "2s",
    animationIterationCount: "infinite",
    animationName: shimmer,
    backgroundImage: "linear-gradient(to right, #f4f4f5, #fafafa, #f4f4f5)",
    backgroundSize: "200% 100%",
    borderRadius: 4,
    height: 12,
    width: 96,
  },
  shimmerLong: { width: 128 },
  searchWrap: { display: "flex", flexDirection: "column", gap: 6 },
  searchResult: {
    alignItems: "center",
    backgroundColor: "#fafafa",
    borderRadius: 8,
    display: "flex",
    gap: 6,
    marginLeft: 18,
    paddingBlock: 6,
    paddingInline: 10,
  },
  children: { display: "flex", flexDirection: "column", gap: 4, marginLeft: 18 },
  childText: {
    color: "#a1a1aa",
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export function ThinkingPanel({
  steps,
  status,
  collapsed,
  onToggle,
}: {
  steps: ThinkingStep[];
  status: AgentStatus;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = collapsed !== undefined ? !collapsed : localExpanded;
  const toggle = onToggle ?? (() => setLocalExpanded((v) => !v));
  const isActive = status.type === "thinking" || status.type === "searching";
  const hasSteps = steps.length > 0;

  if (!hasSteps && !isActive) return null;

  const headerLabel =
    status.type === "searching"
      ? "Searching..."
      : status.type === "thinking"
        ? "Thinking..."
        : "Thought process";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      {...stylex.props(styles.root)}
    >
      <button
        type="button"
        onClick={toggle}
        {...stylex.props(styles.header, isActive && styles.headerActive)}
      >
        {isActive && (
          <CircleNotchIcon className={stylex.props(styles.activeIcon).className} weight="bold" />
        )}
        <span>{headerLabel}</span>
        {expanded ? (
          <CaretDownIcon className={stylex.props(styles.icon).className} weight="bold" />
        ) : (
          <CaretRightIcon className={stylex.props(styles.icon).className} weight="bold" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            {...stylex.props(styles.collapse)}
          >
            <div {...stylex.props(styles.steps)}>
              {steps.map((step) => (
                <StepItem key={step.id} step={step} />
              ))}
              {isActive && !steps.some((s) => s.status === "in_progress") && (
                <div {...stylex.props(styles.row)}>
                  <div {...stylex.props(styles.shimmer)} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StepItem({ step }: { step: ThinkingStep }) {
  if (step.type === "reasoning") {
    return (
      <div {...stylex.props(styles.reasoningWrap)}>
        <div {...stylex.props(styles.reasoningRow)}>
          <BrainIcon className={stylex.props(styles.mutedIcon).className} weight="bold" />
          <p {...stylex.props(styles.reasoningText)}>
            {step.text || <span {...stylex.props(styles.shimmer, styles.shimmerLong)} />}
          </p>
        </div>
      </div>
    );
  }

  if (step.type === "web-search") {
    return (
      <div {...stylex.props(styles.searchWrap)}>
        <div {...stylex.props(styles.row)}>
          {step.status === "in_progress" ? (
            <CircleNotchIcon className={stylex.props(styles.activeIcon).className} weight="bold" />
          ) : (
            <MagnifyingGlassIcon
              className={stylex.props(styles.mutedIcon).className}
              weight="bold"
            />
          )}
          <span {...stylex.props(styles.text)}>
            {step.status === "in_progress" ? "Searching..." : step.text || "Web search"}
          </span>
        </div>
        {step.text && step.status === "done" && (
          <div {...stylex.props(styles.searchResult)}>
            <MagnifyingGlassIcon
              className={stylex.props(styles.mutedIcon).className}
              weight="bold"
            />
            <span {...stylex.props(styles.text)}>{step.text}</span>
          </div>
        )}
        {step.children && step.children.length > 0 && (
          <div {...stylex.props(styles.children)}>
            {step.children.map((child) => (
              <div key={child.id} {...stylex.props(styles.row)}>
                <GlobeIcon className={stylex.props(styles.mutedIcon).className} />
                <span {...stylex.props(styles.childText)}>{child.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.type === "tool-call") {
    return (
      <div {...stylex.props(styles.row)}>
        {step.status === "in_progress" ? (
          <CircleNotchIcon className={stylex.props(styles.activeIcon).className} weight="bold" />
        ) : (
          <CheckCircleIcon className={stylex.props(styles.mutedIcon).className} weight="fill" />
        )}
        <span {...stylex.props(styles.text)}>{step.text}</span>
      </div>
    );
  }

  return null;
}
