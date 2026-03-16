import {
  dir as opfsDir,
  file as opfsFile,
  write as opfsWrite,
} from "@memora/fs";

const PROFILE_DIR = "/chat/profile";
export const PERSONALITY_DOC_PATH = `${PROFILE_DIR}/Personality.md`;
const GLOBAL_MEMORY_PATH = `${PROFILE_DIR}/memory.json`;

export interface MemoryNotice {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface GlobalMemoryData {
  personality?: string;
  notices: MemoryNotice[];
}

interface GlobalMemoryRecord {
  memory: GlobalMemoryData;
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

const normalizeNoticeText = (text: string | null | undefined): string => {
  if (typeof text !== "string") return "";
  return text.trim();
};

const normalizeNotice = (value: unknown): MemoryNotice | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Partial<MemoryNotice>;
  const text = normalizeNoticeText(record.text);
  if (!text) {
    return null;
  }

  const createdAt =
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
      ? record.createdAt
      : Date.now();
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : createdAt;
  const id =
    typeof record.id === "string" && record.id.trim().length > 0
      ? record.id
      : crypto.randomUUID();

  return {
    id,
    text,
    createdAt,
    updatedAt,
  };
};

const normalizeGlobalMemoryData = (value: unknown): GlobalMemoryData | null => {
  const record = normalizeObject(value);
  if (!record) {
    return null;
  }

  const personality = normalizePersonalityText(record.personality as string | null | undefined);
  const notices = Array.isArray(record.notices)
    ? record.notices
        .map((notice) => normalizeNotice(notice))
        .filter((notice): notice is MemoryNotice => notice !== null)
    : [];

  if (!personality && notices.length === 0) {
    return null;
  }

  return {
    personality: personality || undefined,
    notices,
  };
};

const serializeGlobalMemoryData = (memory: GlobalMemoryData): GlobalMemoryData => {
  const personality = normalizePersonalityText(memory.personality);
  const notices = memory.notices
    .map((notice) => normalizeNotice(notice))
    .filter((notice): notice is MemoryNotice => notice !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return {
    personality: personality || undefined,
    notices,
  };
};

const hasStoredGlobalMemory = (memory: GlobalMemoryData): boolean => {
  return !!memory.personality || memory.notices.length > 0;
};

const syncPersonalityDoc = async (personality: string | undefined): Promise<void> => {
  const normalized = normalizePersonalityText(personality);
  if (normalized) {
    await savePersonalityDoc(normalized);
    return;
  }

  await opfsFile(PERSONALITY_DOC_PATH).remove({ force: true });
};

const toLegacyMemoryRecord = (memory: GlobalMemoryData): Record<string, unknown> => {
  const nextMemory: Record<string, unknown> = {
    notices: memory.notices.map((notice) => ({ ...notice })),
  };

  if (memory.personality) {
    nextMemory.personality = memory.personality;
  }

  return nextMemory;
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
  name: string;
  primaryUseCase?: string;
  assistantStyle: string;
  languagePreference?: string;
  aiSetupPreference?: "configure-now" | "later";
}): string => {
  const name = input.name.trim();
  const primaryUseCase = input.primaryUseCase?.trim() ?? "";
  const assistantStyle = input.assistantStyle.trim();
  const languagePreference = input.languagePreference?.trim() ?? "";
  const aiSetupPreference =
    input.aiSetupPreference === "configure-now"
      ? "Configure AI now"
      : input.aiSetupPreference === "later"
        ? "Set up later"
        : "Not specified";
  const updatedAt = new Date().toISOString();

  return [
    "# Personality",
    "",
    "## Assistant Identity",
    "You are Memora's assistant. You support the user with concise, practical, and context-aware help across their files, transcripts, and notes.",
    "",
    "## User Identity",
    name,
    "",
    "## Primary Use Case",
    primaryUseCase || "Not specified",
    "",
    "## Preferred Assistant Style",
    assistantStyle,
    "",
    "## Language Preference",
    languagePreference || "Not specified",
    "",
    "## AI Setup Preference",
    aiSetupPreference,
    "",
    `## Updated At`,
    updatedAt,
  ].join("\n");
};

const parseGlobalMemory = (text: string): GlobalMemoryRecord | null => {
  try {
    const parsed = JSON.parse(text) as Partial<GlobalMemoryRecord>;
    const memory = normalizeGlobalMemoryData(parsed.memory);
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
  const data = await loadGlobalMemoryData();
  return data ? toLegacyMemoryRecord(data) : null;
};

export const loadGlobalMemoryData = async (): Promise<GlobalMemoryData | null> => {
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
  const normalized = normalizeGlobalMemoryData(memory) ?? { notices: [] };
  await saveGlobalMemoryData(normalized);
};

export const saveGlobalMemoryData = async (
  memory: GlobalMemoryData,
): Promise<void> => {
  const normalized = serializeGlobalMemoryData(memory);
  if (!hasStoredGlobalMemory(normalized)) {
    await clearGlobalMemory();
    return;
  }

  await ensureProfileDir();
  const payload: GlobalMemoryRecord = {
    memory: normalized,
    updatedAt: Date.now(),
  };
  await opfsWrite(GLOBAL_MEMORY_PATH, JSON.stringify(payload, null, 2), {
    overwrite: true,
  });
  await syncPersonalityDoc(normalized.personality);
};

export const clearGlobalMemory = async (): Promise<void> => {
  await opfsFile(GLOBAL_MEMORY_PATH).remove({ force: true });
  await syncPersonalityDoc(undefined);
};

export const deleteGlobalMemoryPersonality = async (): Promise<GlobalMemoryData> => {
  const existing = (await loadGlobalMemoryData()) ?? { notices: [] };
  const nextMemory: GlobalMemoryData = {
    notices: existing.notices,
  };
  await saveGlobalMemoryData(nextMemory);
  return nextMemory;
};

export const deleteGlobalMemoryNotice = async (
  noticeId: string,
): Promise<GlobalMemoryData> => {
  const existing = await loadGlobalMemoryData();
  const nextMemory: GlobalMemoryData = {
    personality: existing?.personality,
    notices: (existing?.notices ?? []).filter((notice) => notice.id !== noticeId),
  };
  await saveGlobalMemoryData(nextMemory);
  return nextMemory;
};

export const clearGlobalMemoryNotices = async (): Promise<GlobalMemoryData> => {
  const existing = await loadGlobalMemoryData();
  const nextMemory: GlobalMemoryData = {
    personality: existing?.personality,
    notices: [],
  };
  await saveGlobalMemoryData(nextMemory);
  return nextMemory;
};

const normalizeNoticeLookupKey = (text: string): string => {
  return normalizeNoticeText(text)
    .replace(/[.!?\s]+$/g, "")
    .toLowerCase();
};

export const upsertGlobalMemoryNotices = async (
  noticeTexts: string[],
): Promise<{ updated: boolean; memory: GlobalMemoryData }> => {
  const now = Date.now();
  const existing = (await loadGlobalMemoryData()) ?? { notices: [] };
  const notices = [...existing.notices];
  let updated = false;

  for (const noticeText of noticeTexts) {
    const text = normalizeNoticeText(noticeText);
    if (!text) {
      continue;
    }

    const lookupKey = normalizeNoticeLookupKey(text);
    const existingIndex = notices.findIndex(
      (notice) => normalizeNoticeLookupKey(notice.text) === lookupKey,
    );

    if (existingIndex >= 0) {
      const current = notices[existingIndex];
      if (current.updatedAt !== now) {
        notices[existingIndex] = {
          ...current,
          updatedAt: now,
        };
        updated = true;
      }
      continue;
    }

    notices.push({
      id: crypto.randomUUID(),
      text,
      createdAt: now,
      updatedAt: now,
    });
    updated = true;
  }

  const nextMemory: GlobalMemoryData = {
    personality: existing.personality,
    notices,
  };
  if (updated) {
    await saveGlobalMemoryData(nextMemory);
  }
  return { updated, memory: serializeGlobalMemoryData(nextMemory) };
};
