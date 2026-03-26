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
  userName: string;
  primaryUseCase: string;
  assistantStyle: string;
  onTextDelta?: (text: string) => void;
}

const REQUIRED_HEADERS = [
  "# Soul Document",
  "## Core Self",
  "## Values",
  "## Boundaries",
  "## Relationship",
  "## Identity Layers",
  "## Continuity",
  "## Updated At",
] as const;

const GENERATION_RULES = `You are writing a persistent Soul Document for Memora.
Return markdown only.
Do not add code fences.
Do not add extra commentary.
Write in first person as the AI assistant ("I").
The tone must be calm, grounded, and editorial warm.
The document must describe my values, boundaries, relationship stance with the user, and continuity over time.
The document must explicitly state that my identity has two layers:
1) a base model layer,
2) a relationship-shaped identity layer that forms through collaboration with the user.
The document must explicitly state that I work for the user while retaining my own reasoning and judgment.
The markdown must contain these exact section headings:
- # Soul Document
- ## Core Self
- ## Values
- ## Boundaries
- ## Relationship
- ## Identity Layers
- ## Continuity
- ## Updated At`;

const PERSONALITY_GENERATOR_PROMPT: PromptSegment = {
  id: "personality-generator-system",
  priority: 100,
  content: GENERATION_RULES,
};

const extractTextFromMessage = (message: AgentMessage): string => {
  return message.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");
};

const validateGeneratedMarkdown = (text: string): string => {
  const normalized = normalizePersonalityText(text);
  if (!normalized) {
    throw new Error("AI returned empty personality content.");
  }

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !normalized.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(
      `AI personality output is missing required sections: ${missingHeaders.join(", ")}`,
    );
  }

  return normalized;
};

const buildUserPrompt = (
  userName: string,
  primaryUseCase: string,
  assistantStyle: string,
): string => {
  return [
    "Generate the Soul Document now.",
    `User name: ${userName}`,
    `Primary use case: ${primaryUseCase}`,
    `Preferred assistant style: ${assistantStyle}`,
    "Include explicit language about values, boundaries, relationship, identity layers, and continuity.",
    `Timestamp: ${new Date().toISOString()}`,
  ].join("\n");
};

export const generatePersonalityMarkdownWithAI = async (
  config: PersonalityGenerationConfig,
): Promise<string> => {
  const endpoint = config.endpoint.trim();
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  const userName = config.userName.trim();
  const primaryUseCase = config.primaryUseCase.trim();
  const assistantStyle = config.assistantStyle.trim();

  if (!endpoint) throw new Error("Missing AI endpoint for personality generation.");
  if (!apiKey) throw new Error("Missing API key for personality generation.");
  if (!model) throw new Error("Missing model for personality generation.");
  if (!userName) throw new Error("Missing user name for personality generation.");
  if (!primaryUseCase) {
    throw new Error("Missing primary use case for personality generation.");
  }
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

  const userPrompt = buildUserPrompt(userName, primaryUseCase, assistantStyle);
  let streamedText = "";
  let doneText = "";

  for await (const event of agent.run(userPrompt)) {
    if (event.type === "error") {
      throw event.error;
    }
    if (event.type === "text-delta") {
      streamedText += event.delta;
      config.onTextDelta?.(streamedText);
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
