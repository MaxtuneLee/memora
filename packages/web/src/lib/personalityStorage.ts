import {
  dir as opfsDir,
  file as opfsFile,
  write as opfsWrite,
} from "@memora/fs";

const PROFILE_DIR = "/chat/profile";
export const PERSONALITY_DOC_PATH = `${PROFILE_DIR}/Personality.md`;
const GLOBAL_MEMORY_PATH = `${PROFILE_DIR}/memory.json`;

interface GlobalMemoryRecord {
  memory: Record<string, unknown>;
  updatedAt: number;
}

const ensureProfileDir = async (): Promise<void> => {
  await opfsDir(PROFILE_DIR).create();
};

const normalizeObject = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
};

export const normalizePersonalityText = (text: string | null | undefined): string => {
  if (typeof text !== "string") return "";
  return text.trim();
};

export const hasPersonalityDoc = async (): Promise<boolean> => {
  return opfsFile(PERSONALITY_DOC_PATH).exists();
};

export const loadPersonalityDoc = async (): Promise<string | null> => {
  try {
    const text = await opfsFile(PERSONALITY_DOC_PATH).text();
    const normalized = normalizePersonalityText(text);
    return normalized || null;
  } catch {
    return null;
  }
};

export const savePersonalityDoc = async (content: string): Promise<void> => {
  await ensureProfileDir();
  await opfsWrite(PERSONALITY_DOC_PATH, content, { overwrite: true });
};

export const buildPersonalityMarkdown = (input: {
  userIdentity: string;
  assistantStyle: string;
}): string => {
  const userIdentity = input.userIdentity.trim();
  const assistantStyle = input.assistantStyle.trim();
  const updatedAt = new Date().toISOString();

  return [
    "# Personality",
    "",
    "## Assistant Identity",
    "You are Memora's assistant. You support the user with concise, practical, and context-aware help across their files, transcripts, and notes.",
    "",
    "## User Identity",
    userIdentity,
    "",
    "## Preferred Assistant Style",
    assistantStyle,
    "",
    `## Updated At`,
    updatedAt,
  ].join("\n");
};

const parseGlobalMemory = (text: string): GlobalMemoryRecord | null => {
  try {
    const parsed = JSON.parse(text) as Partial<GlobalMemoryRecord>;
    const memory = normalizeObject(parsed.memory);
    if (!memory) return null;
    const updatedAt =
      typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : Date.now();
    return { memory, updatedAt };
  } catch {
    return null;
  }
};

export const loadGlobalMemory = async (): Promise<Record<string, unknown> | null> => {
  try {
    const text = await opfsFile(GLOBAL_MEMORY_PATH).text();
    const parsed = parseGlobalMemory(text);
    return parsed ? parsed.memory : null;
  } catch {
    return null;
  }
};

export const saveGlobalMemory = async (
  memory: Record<string, unknown>,
): Promise<void> => {
  await ensureProfileDir();
  const payload: GlobalMemoryRecord = {
    memory: { ...memory },
    updatedAt: Date.now(),
  };
  await opfsWrite(GLOBAL_MEMORY_PATH, JSON.stringify(payload, null, 2), {
    overwrite: true,
  });
};

export const clearGlobalMemory = async (): Promise<void> => {
  await opfsFile(GLOBAL_MEMORY_PATH).remove({ force: true });
};
