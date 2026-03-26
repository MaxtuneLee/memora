import { cat, dir as opfsDir, file as opfsFile, mkdir, write } from "@memora/fs";

import type {
  BuiltInSkillManifestEntry,
  BuiltInSkillResourceFile,
  StoredBuiltInSkillMetadata,
} from "./manifest";

export const SKILLS_ROOT_PATH = "/skills";
const BUNDLED_SKILL_METADATA_FILE = ".memora-skill.json";

export const normalizeSkillName = (value: string): string => {
  return value.trim();
};

export const normalizeSkillResourcePath = (value: string): string | { error: string } => {
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized) {
    return { error: "A relative resource path is required." };
  }
  if (normalized.startsWith("/")) {
    return { error: "Absolute paths are not allowed for skill resources." };
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return { error: "Skill resource paths must stay within the skill directory." };
  }
  if (normalized === "SKILL.md") {
    return { error: "Use activate_skill to load SKILL.md." };
  }

  return normalized;
};

export const getSkillRootPath = (skillName: string): string => {
  return `${SKILLS_ROOT_PATH}/${skillName}`;
};

export const getSkillDocumentPath = (skillName: string): string => {
  return `${getSkillRootPath(skillName)}/SKILL.md`;
};

const getSkillMetadataPath = (skillName: string): string => {
  return `${getSkillRootPath(skillName)}/${BUNDLED_SKILL_METADATA_FILE}`;
};

export const getResourceAbsolutePath = (skillName: string, resourcePath: string): string => {
  return `${getSkillRootPath(skillName)}/${resourcePath}`;
};

const getParentDirectory = (path: string): string => {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const separatorIndex = trimmed.lastIndexOf("/");
  if (separatorIndex <= 0) {
    return "/";
  }
  return trimmed.slice(0, separatorIndex);
};

const readStoredMetadata = async (
  skillName: string,
): Promise<StoredBuiltInSkillMetadata | null> => {
  const metadataPath = getSkillMetadataPath(skillName);
  if (!(await opfsFile(metadataPath).exists())) {
    return null;
  }

  try {
    const content = await cat(metadataPath);
    const parsed = JSON.parse(content) as Partial<StoredBuiltInSkillMetadata>;
    if (
      parsed &&
      parsed.name === skillName &&
      parsed.sourceType === "bundled" &&
      typeof parsed.contentHash === "string"
    ) {
      return {
        name: parsed.name,
        sourceType: parsed.sourceType,
        contentHash: parsed.contentHash,
      };
    }
  } catch {
    return null;
  }

  return null;
};

const writeResourceToOpfs = async (
  skillName: string,
  resource: BuiltInSkillResourceFile,
): Promise<void> => {
  const resourcePath = getResourceAbsolutePath(skillName, resource.path);
  await mkdir(getParentDirectory(resourcePath));

  if (resource.isText && resource.content !== null) {
    await write(resourcePath, resource.content, { overwrite: true });
    return;
  }

  if (!resource.assetUrl) {
    throw new Error(
      `Missing asset URL for bundled skill resource "${resource.path}" in "${skillName}".`,
    );
  }

  const response = await fetch(resource.assetUrl);
  if (!response.ok) {
    throw new Error(`Failed to load bundled skill resource "${resource.path}" for "${skillName}".`);
  }

  const bytes = await response.arrayBuffer();
  await write(resourcePath, bytes, { overwrite: true });
};

export const syncBuiltInSkillToOpfs = async (skill: BuiltInSkillManifestEntry): Promise<void> => {
  const metadata = await readStoredMetadata(skill.name);
  const hasSkillDocument = await opfsFile(getSkillDocumentPath(skill.name)).exists();
  if (metadata?.contentHash === skill.contentHash && hasSkillDocument) {
    return;
  }

  await opfsDir(getSkillRootPath(skill.name)).remove({
    recursive: true,
    force: true,
  });
  await mkdir(getSkillRootPath(skill.name));
  await write(getSkillDocumentPath(skill.name), skill.document, {
    overwrite: true,
  });

  for (const resource of skill.resourceFiles) {
    await writeResourceToOpfs(skill.name, resource);
  }

  await write(
    getSkillMetadataPath(skill.name),
    JSON.stringify(
      {
        name: skill.name,
        sourceType: "bundled",
        contentHash: skill.contentHash,
      } satisfies StoredBuiltInSkillMetadata,
      null,
      2,
    ),
    { overwrite: true },
  );
};

let ensureBundledSkillsPromise: Promise<void> | null = null;

export const ensureBuiltInSkillsInOpfs = async (): Promise<void> => {
  if (!ensureBundledSkillsPromise) {
    ensureBundledSkillsPromise = (async () => {
      const { manifestEntries } = await import("./manifest");
      for (const skill of manifestEntries) {
        await syncBuiltInSkillToOpfs(skill);
      }
    })().catch((error) => {
      ensureBundledSkillsPromise = null;
      throw error;
    });
  }

  await ensureBundledSkillsPromise;
};
