import {
  createAgent,
  createInMemoryAdapter,
  type AgentMessage,
  type PromptSegment,
} from "@memora/ai-core";
import { normalizePersonalityText } from "@/lib/settings/personalityStorage";

type ApiFormat = "chat-completions" | "responses";

export interface PersonalityGenerationConfig {
  apiFormat: ApiFormat;
  endpoint: string;
  apiKey: string;
  model: string;
  userIdentity: string;
  assistantStyle: string;
}

const REQUIRED_HEADERS = [
  "# Personality",
  "## Assistant Identity",
  "## User Identity",
  "## Preferred Assistant Style",
  "## Updated At",
] as const;

const GENERATION_RULES = `You are generating a persistent personality profile for Memora.
Return markdown only.
Do not add code fences.
Do not add extra commentary.
The markdown must contain these exact section headings:
- # Personality
- ## Assistant Identity
- ## User Identity
- ## Preferred Assistant Style
- ## Updated At`;

const PERSONALITY_GENERATOR_PROMPT: PromptSegment = {
  id: "personality-generator-system",
  priority: 100,
  content: GENERATION_RULES,
};

const extractTextFromMessage = (message: AgentMessage): string => {
  return message.content
    .filter(
      (content): content is { type: "text"; text: string } =>
        content.type === "text",
    )
    .map((content) => content.text)
    .join("");
};

const validateGeneratedMarkdown = (text: string): string => {
  const normalized = normalizePersonalityText(text);
  if (!normalized) {
    throw new Error("AI returned empty personality content.");
  }

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !normalized.includes(header),
  );
  if (missingHeaders.length > 0) {
    throw new Error(
      `AI personality output is missing required sections: ${missingHeaders.join(", ")}`,
    );
  }

  return normalized;
};

const buildUserPrompt = (
  userIdentity: string,
  assistantStyle: string,
): string => {
  return [
    "Generate the personality markdown now.",
    `User identity: ${userIdentity}`,
    `Preferred assistant style: ${assistantStyle}`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join("\n");
};

export const generatePersonalityMarkdownWithAI = async (
  config: PersonalityGenerationConfig,
): Promise<string> => {
  const endpoint = config.endpoint.trim();
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  const userIdentity = config.userIdentity.trim();
  const assistantStyle = config.assistantStyle.trim();

  if (!endpoint) throw new Error("Missing AI endpoint for personality generation.");
  if (!apiKey) throw new Error("Missing API key for personality generation.");
  if (!model) throw new Error("Missing model for personality generation.");
  if (!userIdentity) throw new Error("Missing user identity for personality generation.");
  if (!assistantStyle) throw new Error("Missing assistant style for personality generation.");

  const agent = createAgent({
    config: {
      id: `memora-onboarding-generator:${crypto.randomUUID()}`,
      model,
      endpoint,
      apiKey,
      apiFormat: config.apiFormat,
      maxIterations: 1,
    },
    persistence: createInMemoryAdapter(),
  });
  agent.addPromptSegment(PERSONALITY_GENERATOR_PROMPT);
  await agent.init();

  const userPrompt = buildUserPrompt(userIdentity, assistantStyle);
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

  const finalText = normalizePersonalityText(doneText || streamedText);
  if (!finalText) {
    throw new Error("AI response did not include personality markdown content.");
  }

  return validateGeneratedMarkdown(finalText);
};
