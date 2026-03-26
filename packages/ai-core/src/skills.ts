import * as v from "valibot";

import type { MaybePromise, PromptSegment, ToolDefinition } from "./types";

export interface SkillCatalogEntry {
  name: string;
  description: string;
  sourceType?: string;
}

export interface SkillActivationRecord extends SkillCatalogEntry {
  instructions: string;
  resourcePaths: string[];
  rootPath?: string;
}

export interface SkillReadSuccess {
  ok: true;
  name: string;
  path: string;
  content: string;
}

export interface SkillReadFailure {
  ok: false;
  error: string;
}

export type SkillReadResult = SkillReadSuccess | SkillReadFailure;

export interface SkillStore {
  listSkills: () => MaybePromise<SkillCatalogEntry[]>;
  activateSkill: (name: string) => MaybePromise<SkillActivationRecord | null>;
  readSkillResource: (name: string, path: string) => MaybePromise<SkillReadResult>;
}

export interface CreateSkillCatalogPromptOptions {
  id?: string;
  priority?: number;
  heading?: string;
  contextLabel?: string;
  activateToolName?: string;
  readResourceToolName?: string;
}

export interface CreateSkillToolsOptions {
  activateToolName?: string;
  readResourceToolName?: string;
  contextLabel?: string;
}

const DEFAULT_PROMPT_ID = "skills-catalog";
const DEFAULT_PROMPT_PRIORITY = 95;
const DEFAULT_HEADING = "## Skills";
const DEFAULT_CONTEXT_LABEL = "This app";
const DEFAULT_ACTIVATE_TOOL_NAME = "activate_skill";
const DEFAULT_READ_RESOURCE_TOOL_NAME = "read_skill_resource";

const normalizeCatalog = (skills: SkillCatalogEntry[]): SkillCatalogEntry[] => {
  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
};

export const createSkillCatalogPromptSegment = (
  store: SkillStore,
  options: CreateSkillCatalogPromptOptions = {},
): PromptSegment => {
  const activateToolName = options.activateToolName ?? DEFAULT_ACTIVATE_TOOL_NAME;
  const readResourceToolName = options.readResourceToolName ?? DEFAULT_READ_RESOURCE_TOOL_NAME;
  const heading = options.heading ?? DEFAULT_HEADING;
  const contextLabel = options.contextLabel ?? DEFAULT_CONTEXT_LABEL;

  return {
    id: options.id ?? DEFAULT_PROMPT_ID,
    priority: options.priority ?? DEFAULT_PROMPT_PRIORITY,
    content: async () => {
      const skills = normalizeCatalog(await store.listSkills());
      if (skills.length === 0) {
        return "";
      }

      const lines = [
        heading,
        `${contextLabel} has the following skills available at runtime.`,
        "Skills provide specialized instructions for tasks that need domain-specific workflows.",
        `Only use a skill when it is clearly relevant to the user's request.`,
        `If the task matches a skill, or the user explicitly mentions a skill name or \`$skill-name\`, call \`${activateToolName}\` with the exact skill name before following that skill.`,
        `After loading a skill, use \`${readResourceToolName}\` for relative files referenced by that skill.`,
        "",
        ...skills.map((skill) => `- \`${skill.name}\`: ${skill.description}`),
      ];

      return lines.join("\n").trim();
    },
  };
};

export const createSkillTools = (
  store: SkillStore,
  options: CreateSkillToolsOptions = {},
): ToolDefinition[] => {
  const activateToolName = options.activateToolName ?? DEFAULT_ACTIVATE_TOOL_NAME;
  const readResourceToolName = options.readResourceToolName ?? DEFAULT_READ_RESOURCE_TOOL_NAME;
  const contextLabel = options.contextLabel ?? DEFAULT_CONTEXT_LABEL;

  return [
    {
      type: "function",
      name: activateToolName,
      description: `Load the full SKILL.md instructions for one of ${contextLabel}'s available skills. Use when the task clearly matches a skill or the user explicitly mentions a skill name or $skill-name.`,
      parameters: v.object({
        name: v.string(),
      }),
      execute: async (params: unknown) => {
        const parsed = params as { name: string };
        const skill = await store.activateSkill(parsed.name);
        if (!skill) {
          const availableSkills = normalizeCatalog(await store.listSkills()).map(
            (entry) => entry.name,
          );
          return {
            error: `Unknown skill "${parsed.name}".`,
            availableSkills,
          };
        }

        return {
          skill: {
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions,
            resourcePaths: skill.resourcePaths,
            ...(skill.rootPath ? { rootPath: skill.rootPath } : {}),
            ...(skill.sourceType ? { sourceType: skill.sourceType } : {}),
          },
        };
      },
    },
    {
      type: "function",
      name: readResourceToolName,
      description:
        "Read a text resource from an activated skill directory. Use only with a relative path referenced by that skill.",
      parameters: v.object({
        name: v.string(),
        path: v.string(),
      }),
      execute: async (params: unknown) => {
        const parsed = params as { name: string; path: string };
        const result = await store.readSkillResource(parsed.name, parsed.path);
        if (!result.ok) {
          return {
            error: result.error,
          };
        }

        return {
          skill: {
            name: result.name,
          },
          resource: {
            path: result.path,
            content: result.content,
          },
        };
      },
    },
  ];
};
