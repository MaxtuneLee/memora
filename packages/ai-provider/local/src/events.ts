import type { ProviderEvent } from "@memora/ai-core";
import type { LocalChatEvent } from "@memora/local-model-runtime";

export const localChatEventToProviderEvent = (event: LocalChatEvent): ProviderEvent | null => {
  switch (event.type) {
    case "text-delta":
    case "reasoning-delta":
    case "reasoning-done":
    case "tool-call-start":
    case "tool-call-args-delta":
    case "tool-call-complete":
      return event;
    case "usage": {
      const { type: _type, ...usage } = event;
      return { type: "usage", usage };
    }
    case "status":
      return { type: "status", status: event.status };
    case "model-progress":
      return {
        type: "status",
        status: event.file ? `loading-model:${event.file}` : "loading-model",
      };
    case "error":
      return { type: "error", error: new Error(event.error.message) };
    case "chat-complete":
      return null;
  }
};
