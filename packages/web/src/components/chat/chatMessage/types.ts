import type { TokenUsage } from "@memora/ai-core";

import type { ThinkingStep } from "@/hooks/chat/useAgent";
import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatImageAttachment[];
  widgets?: ChatWidgetData[];
  thinkingSteps?: ThinkingStep[];
  usage?: TokenUsage;
}
