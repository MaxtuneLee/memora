import { useEffect } from "react";
import * as v from "valibot";
import { useAppStore } from "@/livestore/store";
import { useFeatureModels } from "@/hooks/settings/useFeatureModels";
import { createChatTools } from "@/lib/chat/tools";
import { createShowWidgetSkillTracker } from "@/lib/chat/showWidget";
import { command, registerToolHost, requestToolApproval } from "@/lib/agent-runtime/client";

/** Application service: remains mounted when the user leaves the chat page. */
export function useAgentToolHost(): void {
  const store = useAppStore();
  const { createRuntime } = useFeatureModels();
  useEffect(() => {
    const trackers = new Map<string, ReturnType<typeof createShowWidgetSkillTracker>>();
    return registerToolHost(async (call, signal) => {
      if (signal.aborted) throw new Error("Tool was cancelled.");
      let tracker = trackers.get(call.runId);
      if (!tracker) {
        tracker = createShowWidgetSkillTracker();
        trackers.set(call.runId, tracker);
        const oldest = trackers.keys().next().value;
        if (trackers.size > 64 && oldest) trackers.delete(oldest);
      }
      const tools = createChatTools(store, {
        getReferenceScope: () => call.scope,
        getMemoryExtractionRuntime: () => createRuntime("memoryExtraction", "background"),
        requestWriteApproval: (request) => requestToolApproval(call.callId, request, signal),
        showWidgetSkillTracker: tracker,
        onMemoryUpdated: () => {
          void command({ type: "memory-updated", sessionId: call.sessionId }).catch(console.error);
        },
      });
      const tool = tools.find((item) => item.name === call.name);
      if (!tool) throw new Error(`Unknown tool: ${call.name}`);
      return tool.execute(v.parse(tool.parameters, call.args));
    });
  }, [store, createRuntime]);
}
