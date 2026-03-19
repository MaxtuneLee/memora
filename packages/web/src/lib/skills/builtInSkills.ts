import { createSkillCatalogPromptSegment } from "@memora/ai-core";

export {
  ensureBuiltInSkillsInOpfs,
} from "./builtInSkillStore/opfs";
export {
  builtInSkillStore,
  listBuiltInSkills,
} from "./builtInSkillStore/store";
export type {
  BuiltInSkillManifestEntry,
  BuiltInSkillResourceFile,
  BuiltInSkillSummary,
} from "./builtInSkillStore/manifest";
import { builtInSkillStore } from "./builtInSkillStore/store";

export const BUILT_IN_SKILLS_PROMPT = createSkillCatalogPromptSegment(
  builtInSkillStore,
  {
    id: "built-in-skills",
    priority: 95,
    heading: "## Skills",
    contextLabel: "Memora",
    activateToolName: "activate_skill",
    readResourceToolName: "read_skill_resource",
  },
);
