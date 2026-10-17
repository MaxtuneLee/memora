import { createSkillCatalogPromptSegment } from "@memora/ai-extension-skills";

export { builtInSkillStore, listBuiltInSkills } from "./builtInSkillStore/store";

import { builtInSkillStore } from "./builtInSkillStore/store";

export const BUILT_IN_SKILLS_PROMPT = createSkillCatalogPromptSegment(builtInSkillStore, {
  id: "built-in-skills",
  priority: 95,
  heading: "## Skills",
  contextLabel: "Memora",
  activateToolName: "activate_skill",
  readResourceToolName: "read_skill_resource",
});
