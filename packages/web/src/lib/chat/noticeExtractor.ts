import {
  createAgent,
  createInMemoryAdapter,
  type AgentMessage,
  type PromptSegment,
} from "@memora/ai-core";

export interface NoticeExtractionConfig {
  apiFormat: "chat-completions" | "responses";
  endpoint: string;
  apiKey: string;
  model: string;
  userMessage: string;
  assistantMessage: string;
}

interface NoticeExtractionResult {
  notices?: string[];
}

const NOTICE_EXTRACTOR_PROMPT: PromptSegment = {
  id: "notice-extractor-system",
  priority: 100,
  content: [
    "You extract durable user interaction preferences for Memora.",
    "Return JSON only.",
    "Do not use markdown or code fences.",
    "Only capture stable preferences about how the assistant should communicate in future conversations.",
    "Ignore one-off task formatting requests, temporary constraints, factual profile details, and sensitive inferences.",
    "Each notice must be a single English sentence in third-person form starting with 'User ...' or the user's implicit preference.",
    'Return exactly this JSON shape: {"notices":["..."]}.',
    'If there is no durable preference, return {"notices":[]}',
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

const parseExtractionResponse = (text: string): string[] => {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const parsed = JSON.parse(normalized) as NoticeExtractionResult;
  return normalizeNoticeTexts(parsed.notices);
};

const buildUserPrompt = (userMessage: string, assistantMessage: string): string => {
  return [
    "Review the exchange and extract durable communication preferences.",
    "User message:",
    userMessage.trim(),
    "",
    "Assistant reply:",
    assistantMessage.trim(),
  ].join("\n");
};

export const extractNoticeCandidatesWithAI = async (
  config: NoticeExtractionConfig,
): Promise<string[]> => {
  const endpoint = config.endpoint.trim();
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  const userMessage = config.userMessage.trim();
  const assistantMessage = config.assistantMessage.trim();

  if (!endpoint || !apiKey || !model || !userMessage || !assistantMessage) {
    return [];
  }

  const agent = createAgent({
    config: {
      id: `memora-notice-extractor:${crypto.randomUUID()}`,
      model,
      endpoint,
      apiKey,
      apiFormat: config.apiFormat,
      maxIterations: 1,
    },
    persistence: createInMemoryAdapter(),
  });

  agent.addPromptSegment(NOTICE_EXTRACTOR_PROMPT);
  await agent.init();

  const userPrompt = buildUserPrompt(userMessage, assistantMessage);
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

  return parseExtractionResponse(doneText || streamedText);
};
