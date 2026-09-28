import {
  createAgent,
  createInMemoryAdapter,
  type AgentMessage,
  type PromptSegment,
} from "@memora/ai-core";
import type { PiModelRuntime } from "@memora/ai-provider-pi";

import type { MemoryNoticeChanges } from "@/lib/settings/personalityStorage";

export interface NoticeExtractionConfig {
  runtime: PiModelRuntime;
  userMessage: string;
  assistantMessage: string;
  /** The preferences already saved, so a changed one replaces the old notice. */
  notices?: Array<{ id: string; text: string }>;
}

interface NoticeExtractionResult {
  add?: unknown;
  replace?: unknown;
  remove?: unknown;
  /** The shape before replace and remove existed. */
  notices?: unknown;
}

const NOTICE_EXTRACTOR_PROMPT: PromptSegment = {
  id: "notice-extractor-system",
  priority: 100,
  content: [
    "You keep Memora's list of durable user interaction preferences up to date.",
    "Return JSON only.",
    "Do not use markdown or code fences.",
    "Only capture stable preferences about how the assistant should communicate in future conversations.",
    "Ignore one-off task formatting requests, temporary constraints, factual profile details, and sensitive inferences.",
    "Each notice must be a single English sentence in third-person form starting with 'User ...' or the user's implicit preference.",
    "You also get the preferences already saved, each with a number.",
    "If the exchange changes a saved preference, put the new sentence in replace with that number instead of adding it.",
    "If the user withdraws a saved preference, or a new preference makes it no longer true, put its number in remove.",
    "Do not repeat a saved preference that the exchange leaves unchanged, and leave unrelated saved preferences alone.",
    'Return exactly this JSON shape: {"add":["..."],"replace":[{"id":1,"text":"..."}],"remove":[2]}.',
    'If nothing changes, return {"add":[],"replace":[],"remove":[]}',
  ].join("\n"),
};

const extractTextFromMessage = (message: AgentMessage): string => {
  return message.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");
};

const normalizeNoticeTexts = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const notices: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const text = item.trim();
    if (!text) {
      continue;
    }
    const dedupeKey = text.replace(/[.!?\s]+$/g, "").toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    notices.push(text);
  }

  return notices;
};

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Numbers the model gives back as numbers or numeric strings; anything else is dropped. */
const toNoticeNumber = (value: unknown): number | null => {
  const number = typeof value === "string" ? Number(value.trim()) : value;
  return typeof number === "number" && Number.isInteger(number) ? number : null;
};

/** Reads the extractor's JSON, turning its notice numbers back into IDs of `notices`. */
export const parseNoticeChanges = (
  text: string,
  notices: Array<{ id: string; text: string }>,
): MemoryNoticeChanges => {
  const changes: MemoryNoticeChanges = { add: [], replace: [], remove: [] };
  const normalized = text.trim();
  if (!normalized) {
    return changes;
  }

  const parsed = JSON.parse(normalized) as NoticeExtractionResult;
  const idOf = (value: unknown): string | null => {
    const number = toNoticeNumber(value);
    return number === null ? null : (notices[number - 1]?.id ?? null);
  };

  // The earlier {"notices": [...]} shape still means additions.
  changes.add = normalizeNoticeTexts([...toArray(parsed.add), ...toArray(parsed.notices)]);
  for (const item of toArray(parsed.replace)) {
    if (!item || typeof item !== "object") continue;
    const { id, text: replacement } = item as { id?: unknown; text?: unknown };
    if (typeof replacement !== "string" || !replacement.trim()) continue;
    const noticeId = idOf(id);
    if (noticeId === null) {
      changes.add.push(replacement.trim());
      continue;
    }
    changes.replace.push({ id: noticeId, text: replacement.trim() });
  }
  for (const id of toArray(parsed.remove)) {
    const noticeId = idOf(id);
    if (noticeId !== null && !changes.remove.includes(noticeId)) changes.remove.push(noticeId);
  }

  return changes;
};

export const hasNoticeChanges = (changes: MemoryNoticeChanges): boolean => {
  return changes.add.length > 0 || changes.replace.length > 0 || changes.remove.length > 0;
};

const buildUserPrompt = (
  userMessage: string,
  assistantMessage: string,
  notices: Array<{ id: string; text: string }>,
): string => {
  return [
    "Saved preferences:",
    ...(notices.length > 0
      ? notices.map((notice, index) => `${index + 1}. ${notice.text}`)
      : ["(none)"]),
    "",
    "Review the exchange and say which durable communication preferences to add, replace, or remove.",
    "User message:",
    userMessage.trim(),
    "",
    "Assistant reply:",
    assistantMessage.trim(),
  ].join("\n");
};

export const extractNoticeChangesWithAI = async (
  config: NoticeExtractionConfig,
): Promise<MemoryNoticeChanges> => {
  const userMessage = config.userMessage.trim();
  const assistantMessage = config.assistantMessage.trim();
  const notices = config.notices ?? [];

  if (!userMessage || !assistantMessage) {
    return { add: [], replace: [], remove: [] };
  }

  const agent = createAgent({
    config: {
      id: `memora-notice-extractor:${crypto.randomUUID()}`,
      maxIterations: 1,
    },
    ...config.runtime,
    persistence: createInMemoryAdapter(),
  });

  agent.addPromptSegment(NOTICE_EXTRACTOR_PROMPT);
  await agent.init();

  const userPrompt = buildUserPrompt(userMessage, assistantMessage, notices);
  let streamedText = "";
  let doneText = "";

  for await (const event of agent.run(userPrompt)) {
    if (event.type === "error") {
      throw event.error;
    }
    if (event.type === "text-delta") {
      streamedText += event.delta;
      continue;
    }
    if (event.type === "done") {
      doneText = extractTextFromMessage(event.message);
    }
  }

  return parseNoticeChanges(doneText || streamedText, notices);
};
