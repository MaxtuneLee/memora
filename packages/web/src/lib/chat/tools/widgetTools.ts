import { createSkillTools, type ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

import {
  SHOW_WIDGET_SKILL_NAME,
  SHOW_WIDGET_TOOL_NAME,
  createShowWidgetSkillTracker,
  validateShowWidgetCall,
} from "@/lib/chat/showWidget";
import { builtInSkillStore } from "@/lib/skills/builtInSkills";
import type { CreateChatToolsOptions } from "./shared";

export const createWidgetTools = (options: CreateChatToolsOptions): ToolDefinition[] => {
  const showWidgetSkillTracker = options.showWidgetSkillTracker ?? createShowWidgetSkillTracker();
  const trackedSkillStore = showWidgetSkillTracker.wrapStore(builtInSkillStore);

  return [
    ...createSkillTools(trackedSkillStore, {
      activateToolName: "activate_skill",
      readResourceToolName: "read_skill_resource",
      contextLabel: "Memora",
    }),
    {
      type: "function",
      name: SHOW_WIDGET_TOOL_NAME,
      description: `Stream an interactive chat widget after reading the ${SHOW_WIDGET_SKILL_NAME} skill README, one module guideline, and that module's required section files. widget_code must stream as <style>...</style>, then HTML, then <script>...</script>.`,
      parameters: v.object({
        i_have_seen_read_me: v.boolean(),
        title: v.string(),
        loading_messages: v.array(v.string()),
        widget_code: v.string(),
      }),
      execute: async (params: unknown) => {
        const payload = params as {
          i_have_seen_read_me: boolean;
          title: string;
          loading_messages: string[];
          widget_code: string;
        };
        const validationError = validateShowWidgetCall(payload);
        if (validationError) {
          throw new Error(validationError);
        }

        return {
          ok: true,
          title: payload.title.trim(),
        };
      },
    },
  ];
};
