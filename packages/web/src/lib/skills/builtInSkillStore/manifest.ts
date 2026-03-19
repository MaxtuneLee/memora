import type {
  SkillCatalogEntry,
} from "@memora/ai-core";

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

export interface StoredBuiltInSkillMetadata {
  name: string;
  sourceType: "bundled";
  contentHash: string;
}

const SKILL_FILE_PATTERN = /^\/bundled-skills\/([^/]+)\/SKILL\.md$/;
const SKILL_NAME_PATTERN = /^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/;

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

  return { name, description };
};

export const parseSkillFile = (
  rawContent: string,
  skillFilePath: string,
): { name: string; description: string; body: string; document: string } => {
  const normalized = rawContent.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new Error(`Expected YAML frontmatter in bundled skill ${skillFilePath}`);
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

export const manifestEntries = createManifestEntries();
export const skillByName = new Map(
  manifestEntries.map((skill) => [skill.name, skill]),
);
