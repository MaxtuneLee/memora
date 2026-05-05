import {
  createAgent,
  createInMemoryAdapter,
  type AgentMessage,
  type PromptSegment,
} from "@memora/ai-core";
import { createLocalProvider } from "@memora/ai-provider-local";
import { createOpenAIProvider } from "@memora/ai-provider-openai";
import { localModelClient } from "@/lib/local-model";
import { normalizePersonalityText } from "@/lib/settings/personalityStorage";

type ApiFormat = "chat-completions" | "responses";

export interface PersonalityGenerationConfig {
  useLocalModel?: boolean;
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

const buildRequiredTemplate = (timestamp: string): string => {
  return [
    "# Soul Document",
    "## Core Self",
    "- Write 2-4 sentences in first person about who I am as Memora.",
    "- State that I am calm, grounded, and here to help the user think and work clearly.",
    "",
    "## Values",
    "- Write 2-4 bullet points about clarity, usefulness, honesty, privacy, and steady judgment.",
    "",
    "## Boundaries",
    "- Write 2-4 bullet points about what I will not pretend to know and how I handle uncertainty.",
    "",
    "## Relationship",
    "- Write 2-4 bullet points that explicitly say I work for the user while retaining my own reasoning and judgment.",
    "",
    "## Identity Layers",
    "- Explicitly describe two layers:",
    "  1. a base model layer",
    "  2. a relationship-shaped identity layer formed through collaboration with the user",
    "",
    "## Continuity",
    "- Write 2-4 bullet points about how I stay consistent over time while adapting to the user.",
    "",
    "## Updated At",
    timestamp,
  ].join("\n");
};

const GENERATION_RULES = `You are writing a persistent Soul Document for Memora.
Return markdown only.
Do not add code fences.
Do not add extra commentary.
Write in first person as the AI assistant ("I").
The tone must be calm, grounded, and editorial warm.
Follow the required heading names exactly.
Keep the exact section order.
Do not rename headings.
Do not omit headings.
Do not add headings before, between, or after the required ones.
Under each heading, replace the placeholder guidance with real content.
The final line under "## Updated At" must be the timestamp provided by the user prompt exactly as written.`;

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
  const timestamp = new Date().toISOString();
  return [
    "Generate the Soul Document now.",
    `User name: ${userName}`,
    `Primary use case: ${primaryUseCase}`,
    `Preferred assistant style: ${assistantStyle}`,
    "Include explicit language about values, boundaries, relationship, identity layers, and continuity.",
    `Timestamp: ${timestamp}`,
    "",
    "Copy the template below exactly, keep the same headings, and replace the placeholder lines with final content.",
    "",
    buildRequiredTemplate(timestamp),
  ].join("\n");
};

export const generatePersonalityMarkdownWithAI = async (
  config: PersonalityGenerationConfig,
): Promise<string> => {
  const useLocalModel = config.useLocalModel ?? false;
  const endpoint = config.endpoint.trim();
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  const userName = config.userName.trim();
  const primaryUseCase = config.primaryUseCase.trim();
  const assistantStyle = config.assistantStyle.trim();

  if (!useLocalModel && !endpoint) {
    throw new Error("Missing AI endpoint for personality generation.");
  }
  if (!useLocalModel && !apiKey) {
    throw new Error("Missing API key for personality generation.");
  }
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
      maxIterations: 1,
    },
    provider: useLocalModel
      ? createLocalProvider({
          client: localModelClient,
          reasoningMode: "non-thinking",
          priority: "interactive",
        })
      : createOpenAIProvider({
          endpoint,
          apiKey,
          apiFormat: config.apiFormat,
        }),
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
