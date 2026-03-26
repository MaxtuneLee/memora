import type { SkillStore } from "@memora/ai-core";
import { cat } from "@memora/fs";

import {
  ensureBuiltInSkillsInOpfs,
  getResourceAbsolutePath,
  getSkillDocumentPath,
  getSkillRootPath,
  normalizeSkillName,
  normalizeSkillResourcePath,
  syncBuiltInSkillToOpfs,
} from "./opfs";
import type { BuiltInSkillSummary } from "./manifest";
import { manifestEntries, parseSkillFile, skillByName } from "./manifest";

export const listBuiltInSkills = (): BuiltInSkillSummary[] => {
  return manifestEntries.map((skill) => ({
    name: skill.name,
    description: skill.description,
    sourceType: skill.sourceType,
    resourceCount: skill.resourceFiles.length,
  }));
};

export const builtInSkillStore: SkillStore = {
  listSkills: async () => {
    await ensureBuiltInSkillsInOpfs();
    return manifestEntries.map((skill) => ({
      name: skill.name,
      description: skill.description,
      sourceType: skill.sourceType,
    }));
  },

  activateSkill: async (skillName) => {
    const normalizedName = normalizeSkillName(skillName);
    const manifestEntry = skillByName.get(normalizedName);
    if (!manifestEntry) {
      return null;
    }

    await syncBuiltInSkillToOpfs(manifestEntry);
    const document = await cat(getSkillDocumentPath(manifestEntry.name));
    const parsed = parseSkillFile(document, getSkillDocumentPath(manifestEntry.name));

    return {
      name: parsed.name,
      description: parsed.description,
      instructions: parsed.body,
      resourcePaths: manifestEntry.resourceFiles.map((resource) => resource.path),
      rootPath: getSkillRootPath(manifestEntry.name),
      sourceType: manifestEntry.sourceType,
    };
  },

  readSkillResource: async (skillName, resourcePath) => {
    const normalizedName = normalizeSkillName(skillName);
    const manifestEntry = skillByName.get(normalizedName);
    if (!manifestEntry) {
      return {
        ok: false,
        error: `Unknown skill "${skillName}".`,
      } as const;
    }

    const normalizedPath = normalizeSkillResourcePath(resourcePath);
    if (typeof normalizedPath !== "string") {
      return {
        ok: false,
        error: normalizedPath.error,
      } as const;
    }

    const resource = manifestEntry.resourceFiles.find(
      (candidate) => candidate.path === normalizedPath,
    );
    if (!resource) {
      return {
        ok: false,
        error: `Resource "${normalizedPath}" was not found in skill "${manifestEntry.name}".`,
      } as const;
    }
    if (!resource.isText) {
      return {
        ok: false,
        error: `Resource "${normalizedPath}" in skill "${manifestEntry.name}" is binary and cannot be read as text.`,
      } as const;
    }

    await syncBuiltInSkillToOpfs(manifestEntry);

    try {
      const content = await cat(getResourceAbsolutePath(manifestEntry.name, normalizedPath));
      return {
        ok: true,
        name: manifestEntry.name,
        path: normalizedPath,
        content,
      } as const;
    } catch {
      return {
        ok: false,
        error: `Resource "${normalizedPath}" could not be read from skill "${manifestEntry.name}".`,
      } as const;
    }
  },
};
