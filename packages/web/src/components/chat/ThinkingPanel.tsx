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
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "motion/react";
import type { AgentStatus, ThinkingStep } from "@/hooks/chat/useAgent";

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
      className="mb-3"
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium transition-colors",
          isActive ? "text-teal-600" : "text-zinc-400 hover:text-zinc-600",
        )}
      >
        {isActive && (
          <CircleNotchIcon className="size-3 animate-spin" weight="bold" />
        )}
        <span>{headerLabel}</span>
        {expanded ? (
          <CaretDownIcon className="size-3" weight="bold" />
        ) : (
          <CaretRightIcon className="size-3" weight="bold" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 border-l-2 border-zinc-200 pl-3">
              {steps.map((step) => (
                <StepItem key={step.id} step={step} />
              ))}
              {isActive && !steps.some((s) => s.status === "in_progress") && (
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-24 rounded bg-linear-to-r from-zinc-100 via-zinc-50 to-zinc-100 bg-size-[200%_100%] animate-shimmer" />
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
      <div className="space-y-1">
        <div className="flex items-start gap-1.5">
          <BrainIcon
            className="mt-0.5 size-3 shrink-0 text-zinc-400"
            weight="bold"
          />
          <p className="text-xs text-zinc-500 leading-relaxed">
            {step.text || (
              <span className="inline-block h-3 w-32 rounded bg-linear-to-r from-zinc-100 via-zinc-50 to-zinc-100 bg-size-[200%_100%] animate-shimmer" />
            )}
          </p>
        </div>
      </div>
    );
  }

  if (step.type === "web-search") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          {step.status === "in_progress" ? (
            <CircleNotchIcon
              className="size-3 shrink-0 animate-spin text-teal-500"
              weight="bold"
            />
          ) : (
            <MagnifyingGlassIcon
              className="size-3 shrink-0 text-zinc-400"
              weight="bold"
            />
          )}
          <span className="text-xs text-zinc-500">
            {step.status === "in_progress"
              ? "Searching..."
              : step.text || "Web search"}
          </span>
        </div>
        {step.text && step.status === "done" && (
          <div className="ml-4.5 flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5">
            <MagnifyingGlassIcon
              className="size-3 shrink-0 text-zinc-400"
              weight="bold"
            />
            <span className="text-xs text-zinc-600">{step.text}</span>
          </div>
        )}
        {step.children && step.children.length > 0 && (
          <div className="ml-4.5 space-y-1">
            {step.children.map((child) => (
              <div key={child.id} className="flex items-center gap-1.5">
                <GlobeIcon className="size-3 shrink-0 text-zinc-300" />
                <span className="truncate text-xs text-zinc-400">
                  {child.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.type === "tool-call") {
    return (
      <div className="flex items-center gap-1.5">
        {step.status === "in_progress" ? (
          <CircleNotchIcon
            className="size-3 shrink-0 animate-spin text-teal-500"
            weight="bold"
          />
        ) : (
          <CheckCircleIcon
            className="size-3 shrink-0 text-zinc-400"
            weight="fill"
          />
        )}
        <span className="text-xs text-zinc-500">{step.text}</span>
      </div>
    );
  }

  return null;
}
