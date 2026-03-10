import { dir as opfsDir, file as opfsFile, glob, write as opfsWrite } from "@memora/fs";

const CHAT_SESSIONS_DIR = "/chat/sessions";
const SESSION_SCHEMA_VERSION = 1 as const;
export const DEFAULT_CHAT_SESSION_TITLE = "New session";

interface ChatSessionThinkingStep {
  id: string;
  type: "reasoning" | "web-search" | "tool-call" | "output-item";
  text: string;
  status: "in_progress" | "done";
  children?: ChatSessionThinkingStep[];
}

export interface ChatSessionReference {
  type: "file" | "folder";
  id: string;
  name: string;
}

export interface ChatSessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinkingSteps?: ChatSessionThinkingStep[];
}

export interface ChatSessionRecord {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatSessionMessage[];
  references: ChatSessionReference[];
  agentStore: Record<string, Record<string, unknown>>;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

const sessionQueue = new Map<string, Promise<unknown>>();

const normalizeSessionPath = (sessionId: string): string => {
  const safeId = sessionId.trim();
  if (!safeId) {
    throw new Error("Session id is required");
  }
  return `${CHAT_SESSIONS_DIR}/${safeId}.json`;
};

const ensureSessionsDir = async (): Promise<void> => {
  await opfsDir(CHAT_SESSIONS_DIR).create();
};

const getSessionPreview = (messages: ChatSessionMessage[]): string => {
  const last = [...messages].reverse().find((message) => message.content.trim());
  if (!last) return "";
  return last.content.trim().slice(0, 80);
};

const getAutoTitleFromMessages = (messages: ChatSessionMessage[]): string | null => {
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.content.trim().length > 0,
  );
  if (!firstUserMessage) return null;
  return firstUserMessage.content.trim().replace(/\s+/g, " ").slice(0, 48);
};

const normalizeThinkingSteps = (
  steps: unknown,
): ChatSessionThinkingStep[] | undefined => {
  if (!Array.isArray(steps)) return undefined;
  const normalized: ChatSessionThinkingStep[] = [];

  for (const step of steps) {
    if (typeof step !== "object" || step === null) continue;
    const value = step as Partial<ChatSessionThinkingStep>;
    if (
      typeof value.id !== "string" ||
      typeof value.text !== "string" ||
      (value.type !== "reasoning" &&
        value.type !== "web-search" &&
        value.type !== "tool-call" &&
        value.type !== "output-item") ||
      (value.status !== "in_progress" && value.status !== "done")
    ) {
      continue;
    }

    const nextStep: ChatSessionThinkingStep = {
      id: value.id,
      type: value.type,
      text: value.text,
      status: value.status,
    };

    const children = normalizeThinkingSteps(value.children);
    if (children && children.length > 0) {
      nextStep.children = children;
    }

    normalized.push(nextStep);
  }

  return normalized.length > 0 ? normalized : undefined;
};

const normalizeMessages = (messages: unknown): ChatSessionMessage[] => {
  if (!Array.isArray(messages)) return [];
  const normalized: ChatSessionMessage[] = [];

  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const value = message as Partial<ChatSessionMessage>;
    if (
      typeof value.id !== "string" ||
      (value.role !== "user" && value.role !== "assistant") ||
      typeof value.content !== "string"
    ) {
      continue;
    }

    const normalizedMessage: ChatSessionMessage = {
      id: value.id,
      role: value.role,
      content: value.content,
    };

    const thinkingSteps = normalizeThinkingSteps(value.thinkingSteps);
    if (thinkingSteps && thinkingSteps.length > 0) {
      normalizedMessage.thinkingSteps = thinkingSteps;
    }

    normalized.push(normalizedMessage);
  }

  return normalized;
};

const normalizeReferences = (references: unknown): ChatSessionReference[] => {
  if (!Array.isArray(references)) return [];

  const seen = new Set<string>();
  const normalized: ChatSessionReference[] = [];

  for (const reference of references) {
    if (typeof reference !== "object" || reference === null) continue;
    const value = reference as Partial<ChatSessionReference>;
    if (
      (value.type !== "file" && value.type !== "folder") ||
      typeof value.id !== "string" ||
      typeof value.name !== "string"
    ) {
      continue;
    }

    const id = value.id.trim();
    const name = value.name.trim();
    if (!id || !name) continue;

    const key = `${value.type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      type: value.type,
      id,
      name,
    });
  }

  return normalized;
};

const normalizeAgentStore = (
  store: unknown,
): Record<string, Record<string, unknown>> => {
  if (typeof store !== "object" || store === null) return {};
  const result: Record<string, Record<string, unknown>> = {};
  for (const [agentId, value] of Object.entries(store)) {
    if (!agentId || typeof value !== "object" || value === null) continue;
    result[agentId] = { ...(value as Record<string, unknown>) };
  }
  return result;
};

const parseRecord = (raw: string): ChatSessionRecord | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<ChatSessionRecord>;
    if (typeof parsed.id !== "string" || !parsed.id.trim()) return null;
    const messages = normalizeMessages(parsed.messages);
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : getAutoTitleFromMessages(messages) ?? DEFAULT_CHAT_SESSION_TITLE;
    const now = Date.now();
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: parsed.id.trim(),
      title,
      createdAt:
        typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt)
          ? parsed.createdAt
          : now,
      updatedAt:
        typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : now,
      messages,
      references: normalizeReferences(parsed.references),
      agentStore: normalizeAgentStore(parsed.agentStore),
    };
  } catch {
    return null;
  }
};

const buildSummary = (record: ChatSessionRecord): ChatSessionSummary => {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.messages.length,
    preview: getSessionPreview(record.messages),
  };
};

const runSessionMutation = async <T>(
  sessionId: string,
  task: () => Promise<T>,
): Promise<T> => {
  const queue = sessionQueue.get(sessionId) ?? Promise.resolve();
  const next = queue.then(task, task);
  sessionQueue.set(
    sessionId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
};

const writeRecord = async (record: ChatSessionRecord): Promise<void> => {
  await ensureSessionsDir();
  await opfsWrite(normalizeSessionPath(record.id), JSON.stringify(record, null, 2), {
    overwrite: true,
  });
};

const createEmptyRecord = (sessionId?: string): ChatSessionRecord => {
  const timestamp = Date.now();
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: sessionId ?? crypto.randomUUID(),
    title: DEFAULT_CHAT_SESSION_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
    references: [],
    agentStore: {},
  };
};

export const createChatSession = async (): Promise<ChatSessionRecord> => {
  const record = createEmptyRecord();
  await writeRecord(record);
  return record;
};

export const loadChatSession = async (
  sessionId: string,
): Promise<ChatSessionRecord | null> => {
  try {
    const text = await opfsFile(normalizeSessionPath(sessionId)).text();
    return parseRecord(text);
  } catch {
    return null;
  }
};

export const listChatSessions = async (): Promise<ChatSessionSummary[]> => {
  await ensureSessionsDir();
  const paths = await glob("*.json", {
    cwd: CHAT_SESSIONS_DIR,
    files: true,
    dirs: false,
  });
  const records = await Promise.all(
    paths.map(async (path) => {
      try {
        const text = await opfsFile(path).text();
        return parseRecord(text);
      } catch {
        return null;
      }
    }),
  );
  return records
    .filter((record): record is ChatSessionRecord => record !== null)
    .map(buildSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const updateChatSession = async (
  sessionId: string,
  updater: (record: ChatSessionRecord) => ChatSessionRecord | Promise<ChatSessionRecord>,
): Promise<ChatSessionRecord> => {
  return runSessionMutation(sessionId, async () => {
    const existing = await loadChatSession(sessionId);
    const base = existing ?? createEmptyRecord(sessionId);
    const next = await updater(base);
    const normalizedMessages = normalizeMessages(next.messages);
    const normalizedReferences = normalizeReferences(
      next.references ?? base.references,
    );
    const autoTitle = getAutoTitleFromMessages(normalizedMessages);
    const title =
      typeof next.title === "string" && next.title.trim()
        ? next.title.trim()
        : autoTitle ?? DEFAULT_CHAT_SESSION_TITLE;
    const record: ChatSessionRecord = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: sessionId,
      title,
      createdAt:
        typeof next.createdAt === "number" && Number.isFinite(next.createdAt)
          ? next.createdAt
          : base.createdAt,
      updatedAt: Date.now(),
      messages: normalizedMessages,
      references: normalizedReferences,
      agentStore: normalizeAgentStore(next.agentStore),
    };
    await writeRecord(record);
    return record;
  });
};

export const updateChatSessionMessages = async (
  sessionId: string,
  messages: ChatSessionMessage[],
  options?: { references?: ChatSessionReference[] },
): Promise<ChatSessionRecord> => {
  return updateChatSession(sessionId, (record) => {
    const normalizedMessages = normalizeMessages(messages);
    const autoTitle = getAutoTitleFromMessages(normalizedMessages);
    const keepExistingTitle =
      record.title !== DEFAULT_CHAT_SESSION_TITLE && record.title.trim().length > 0;
    return {
      ...record,
      title: keepExistingTitle
        ? record.title
        : autoTitle ?? record.title ?? DEFAULT_CHAT_SESSION_TITLE,
      messages: normalizedMessages,
      references: options?.references ?? record.references,
    };
  });
};

export const ensureChatSession = async (
  sessionId: string,
): Promise<ChatSessionRecord> => {
  const existing = await loadChatSession(sessionId);
  if (existing) return existing;
  const record = createEmptyRecord(sessionId);
  await writeRecord(record);
  return record;
};

export const deleteChatSession = async (sessionId: string): Promise<void> => {
  const path = normalizeSessionPath(sessionId);
  await opfsFile(path).remove({ force: true });
  sessionQueue.delete(sessionId);
};
