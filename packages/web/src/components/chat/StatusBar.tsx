import { cn } from "@/lib/cn";
import { motion } from "motion/react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import type { AgentStatus } from "@/hooks/chat/useAgent";

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
      className="mb-2"
    >
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
          status.type === "error"
            ? "bg-red-50 text-red-500"
            : "bg-linear-to-r from-zinc-100 via-zinc-50 to-zinc-100 bg-size-[200%_100%] text-zinc-500 animate-shimmer",
        )}
      >
        {status.type !== "error" && (
          <CircleNotchIcon className="size-3 animate-spin" weight="bold" />
        )}
        <span>{label}</span>
      </div>
    </motion.div>
  );
}
