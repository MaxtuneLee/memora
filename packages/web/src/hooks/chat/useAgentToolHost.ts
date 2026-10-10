import { useEffect } from "react";
import * as v from "valibot";
import { useAppStore } from "@/livestore/store";
import { normalizeSettingsValue, settingEvents } from "@/livestore/setting";
import { useFeatureModels } from "@/hooks/settings/useFeatureModels";
import { autoReviewThenAsk } from "@/lib/chat/autoReview";
import { DEFAULT_PERMISSION_MODE, type AccessRequest } from "@/lib/chat/permissions";
import { createChatTools } from "@/lib/chat/tools";
import { getDocumentToolTarget } from "@/lib/chat/tools/documentTools";
import { createShowWidgetSkillTracker } from "@/lib/chat/showWidget";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import {
  command,
  registerToolHost,
  reportAccessDecision,
  requestToolApproval,
} from "@/lib/agent-runtime/client";

/** Application service: remains mounted when the user leaves the chat page. */
export function useAgentToolHost(): void {
  const store = useAppStore();
  const { createRuntime } = useFeatureModels();
  useEffect(() => {
    const trackers = new Map<string, ReturnType<typeof createShowWidgetSkillTracker>>();
    const settings = () => normalizeSettingsValue(store.query(settingsDocumentQuery$));
    return registerToolHost(async (call, signal) => {
      if (signal.aborted) throw new Error("Tool was cancelled.");
      let tracker = trackers.get(call.runId);
      if (!tracker) {
        tracker = createShowWidgetSkillTracker();
        trackers.set(call.runId, tracker);
        const oldest = trackers.keys().next().value;
        if (trackers.size > 64 && oldest) trackers.delete(oldest);
      }
      const mode = call.permissionMode ?? settings().permissionMode ?? DEFAULT_PERMISSION_MODE;
      const askUser = async (request: AccessRequest) => ({
        decision: await requestToolApproval(call.callId, request, signal),
        source: "user" as const,
      });
      const tools = createChatTools(store, {
        getReferenceScope: () => call.scope,
        getMemoryExtractionRuntime: () => createRuntime("memoryExtraction", "background"),
        getPermissionMode: () => mode,
        getPermissionGrants: () => settings().permissionGrants ?? [],
        addPermissionGrants: (grants) => {
          store.commit(
            settingEvents.settingsSet({
              permissionGrants: [...(settings().permissionGrants ?? []), ...grants],
            }),
          );
        },
        requestAccess: (request) =>
          mode.approver === "auto"
            ? autoReviewThenAsk(
                { request, args: call.args, userMessages: call.userMessages },
                () => createRuntime("permissionReview"),
                askUser,
              )
            : askUser(request),
        onAccessDecided: (request, result) => reportAccessDecision(call.callId, request, result),
        documentTarget: getDocumentToolTarget(call.sessionId),
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
