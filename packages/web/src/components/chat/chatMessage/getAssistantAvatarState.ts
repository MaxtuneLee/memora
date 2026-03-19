import type { AgentStatus } from "@/hooks/chat/useAgent";

import type { MemoraMascotState } from "@/components/assistant/MemoraMascot";

export function getAssistantAvatarState(
  status: AgentStatus | undefined,
  isStreaming: boolean,
): MemoraMascotState {
  if (status?.type === "thinking" || status?.type === "searching") {
    return "thinking";
  }
  if (status?.type === "tool-calling" || status?.type === "tool-running") {
    return "listening";
  }
  if (isStreaming || status?.type === "generating") {
    return "speaking";
  }
  return "idle";
}
