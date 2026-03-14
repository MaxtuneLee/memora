import {
  createSkillCatalogPromptSegment,
  type SkillCatalogEntry,
  type SkillStore,
} from "@memora/ai-core";
import { cat, dir as opfsDir, file as opfsFile, mkdir, write } from "@memora/fs";

export interface BuiltInSkillResourceFile {
  path: string;
  isText: boolean;
  content: string | null;
  assetUrl: string | null;
}

export interface BuiltInSkillManifestEntry extends SkillCatalogEntry {
  entryPath: string;
  document: string;
  body: string;
  resourceFiles: BuiltInSkillResourceFile[];
  sourceType: "bundled";
  contentHash: string;
}

export interface BuiltInSkillSummary {
  name: string;
  description: string;
  sourceType: "bundled";
  resourceCount: number;
}

interface StoredBuiltInSkillMetadata {
  name: string;
  sourceType: "bundled";
  contentHash: string;
}

const SKILL_FILE_PATTERN = /^\/bundled-skills\/([^/]+)\/SKILL\.md$/;
const SKILL_NAME_PATTERN = /^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/;
const SKILLS_ROOT_PATH = "/skills";
const BUNDLED_SKILL_METADATA_FILE = ".memora-skill.json";

const bundledSkillBodies = import.meta.glob("/bundled-skills/*/SKILL.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const bundledSkillTextResources = import.meta.glob(
  "/bundled-skills/**/*.{css,html,js,json,jsx,md,mjs,svg,ts,tsx,txt,yaml,yml}",
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
) as Record<string, string>;

const bundledSkillAssetUrls = import.meta.glob("/bundled-skills/**/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const bundledSkillFiles = Object.keys(bundledSkillAssetUrls).sort((left, right) =>
  left.localeCompare(right),
);

const parseScalarValue = (value: string): string => {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const inner = value.slice(1, -1);
    return inner
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"")
      .replace(/\\'/g, "'");
  }

  return value;
};

const parseFrontmatter = (
  block: string,
  skillFilePath: string,
): { name: string; description: string } => {
  const values = new Map<string, string>();

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (
      rawLine.startsWith(" ") ||
      rawLine.startsWith("\t") ||
      line.startsWith("-")
    ) {
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex <= 0) {
      throw new Error(
        `Invalid frontmatter line in bundled skill ${skillFilePath}: "${rawLine.trim()}"`,
      );
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    const frontmatterValue = rawLine.slice(separatorIndex + 1).trim();
    values.set(key, parseScalarValue(frontmatterValue));
  }

  const name = values.get("name")?.trim() ?? "";
  const description = values.get("description")?.trim() ?? "";

  if (!name) {
    throw new Error(`Missing required "name" in bundled skill ${skillFilePath}`);
  }

  if (!description) {
    throw new Error(
      `Missing required "description" in bundled skill ${skillFilePath}`,
    );
  }

  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error(
      `Bundled skill "${name}" must match ${SKILL_NAME_PATTERN.source}`,
    );
  }

  return {
    name,
    description,
  };
};

const parseSkillFile = (
  rawContent: string,
  skillFilePath: string,
): { name: string; description: string; body: string; document: string } => {
  const normalized = rawContent.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);

  if (!match) {
    throw new Error(
      `Expected YAML frontmatter in bundled skill ${skillFilePath}`,
    );
  }

  const frontmatter = parseFrontmatter(match[1], skillFilePath);
  return {
    ...frontmatter,
    body: normalized.slice(match[0].length).trim(),
    document: normalized,
  };
};

const toResourcePath = (skillName: string, absolutePath: string): string => {
  const prefix = `/bundled-skills/${skillName}/`;
  if (!absolutePath.startsWith(prefix)) {
    throw new Error(
      `Bundled skill resource path "${absolutePath}" is outside skill "${skillName}".`,
    );
  }

  return absolutePath.slice(prefix.length);
};

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createManifestEntries = (): BuiltInSkillManifestEntry[] => {
  return Object.entries(bundledSkillBodies)
    .map(([skillFilePath, rawContent]) => {
      const match = skillFilePath.match(SKILL_FILE_PATTERN);
      if (!match) {
        throw new Error(
          `Built-in skill path "${skillFilePath}" must match /bundled-skills/<skill-name>/SKILL.md`,
        );
      }

      const directoryName = match[1];
      const parsed = parseSkillFile(rawContent, skillFilePath);
      if (parsed.name !== directoryName) {
        throw new Error(
          `Bundled skill directory "${directoryName}" must match frontmatter name "${parsed.name}".`,
        );
      }

      const resourceFiles = bundledSkillFiles
        .filter((candidatePath) => {
          return (
            candidatePath.startsWith(`/bundled-skills/${directoryName}/`) &&
            candidatePath !== skillFilePath
          );
        })
        .map((absolutePath) => {
          const relativePath = toResourcePath(directoryName, absolutePath);
          const content = bundledSkillTextResources[absolutePath] ?? null;
          const assetUrl = bundledSkillAssetUrls[absolutePath] ?? null;

          return {
            path: relativePath,
            isText: content !== null,
            content,
            assetUrl,
          };
        });

      const hashInput = [
        parsed.document,
        ...resourceFiles.flatMap((resource) => [
          resource.path,
          resource.isText ? "text" : "binary",
          resource.content ?? "",
          resource.assetUrl ?? "",
        ]),
      ].join("\n::\n");

      return {
        name: parsed.name,
        description: parsed.description,
        entryPath: `${parsed.name}/SKILL.md`,
        document: parsed.document,
        body: parsed.body,
        resourceFiles,
        sourceType: "bundled" as const,
        contentHash: hashString(hashInput),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

const manifestEntries = createManifestEntries();

const skillByName = new Map(manifestEntries.map((skill) => [skill.name, skill]));

const normalizeSkillName = (value: string): string => {
  return value.trim();
};

const normalizeSkillResourcePath = (value: string): string | { error: string } => {
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized) {
    return {
      error: "A relative resource path is required.",
    };
  }

  if (normalized.startsWith("/")) {
    return {
      error: "Absolute paths are not allowed for skill resources.",
    };
  }

  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return {
      error: "Skill resource paths must stay within the skill directory.",
    };
  }

  if (normalized === "SKILL.md") {
    return {
      error: "Use activate_skill to load SKILL.md.",
    };
  }

  return normalized;
};

const getSkillRootPath = (skillName: string): string => {
  return `${SKILLS_ROOT_PATH}/${skillName}`;
};

const getSkillDocumentPath = (skillName: string): string => {
  return `${getSkillRootPath(skillName)}/SKILL.md`;
};

const getSkillMetadataPath = (skillName: string): string => {
  return `${getSkillRootPath(skillName)}/${BUNDLED_SKILL_METADATA_FILE}`;
};

const getResourceAbsolutePath = (
  skillName: string,
  resourcePath: string,
): string => {
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
    throw new Error(
      `Failed to load bundled skill resource "${resource.path}" for "${skillName}".`,
    );
  }

  const bytes = await response.arrayBuffer();
  await write(resourcePath, bytes, { overwrite: true });
};

const syncBuiltInSkillToOpfs = async (
  skill: BuiltInSkillManifestEntry,
): Promise<void> => {
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
    {
      overwrite: true,
    },
  );
};

let ensureBundledSkillsPromise: Promise<void> | null = null;

export const ensureBuiltInSkillsInOpfs = async (): Promise<void> => {
  if (!ensureBundledSkillsPromise) {
    ensureBundledSkillsPromise = (async () => {
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
      const content = await cat(
        getResourceAbsolutePath(manifestEntry.name, normalizedPath),
      );
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
