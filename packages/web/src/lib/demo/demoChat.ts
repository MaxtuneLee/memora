import { createLocalPiRuntime, type PiModelRuntime } from "@memora/ai-provider-pi";
import type {
  LocalChatEvent,
  LocalChatMessage,
  LocalChatRequest,
  LocalModelManifest,
} from "@memora/local-model-runtime";

import BAYES_LESSON_WIDGET from "./bayesLesson.html?raw";
import { DEMO_LECTURE_NAME } from "./bayesLecture";
import { DEMO_MODEL_ID } from "./demoMode";

const DEMO_CHAT_MANIFEST: LocalModelManifest = {
  id: DEMO_MODEL_ID,
  displayName: "Memora demo",
  family: "demo",
  task: "chat",
  modelId: DEMO_MODEL_ID,
  runtime: "transformers-js",
  device: "wasm",
  pool: "chat",
  modalities: { input: ["text"], output: ["text", "tool-call"] },
  limits: { contextWindow: 128_000, maxOutputTokens: 4096 },
  chat: {
    adapter: "demo",
    supportsSystemPrompt: true,
    supportsStreaming: true,
    supportsReasoning: false,
    reasoningModes: ["non-thinking"],
    defaultReasoningMode: "non-thinking",
    supportsTools: true,
  },
};

interface ScriptedToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface ScriptedReply {
  /** Pause before the reply starts, like a model thinking. */
  delayMs: number;
  text?: string;
  tools?: ScriptedToolCall[];
}

const SKILL = "show-widget-skills";

const textOf = (message: LocalChatMessage | undefined): string =>
  (message?.content ?? []).map((part) => (part.type === "text" ? part.text : "")).join("");

const jump = (fileId: string, startSec: number, endSec: number, context: string): string =>
  `<memora-jump fileId="${fileId}" fileName="${DEMO_LECTURE_NAME}" mediaType="audio" startSec="${startSec}" endSec="${endSec}" context="${context}" />`;

const lessonText = (fileId: string | null): string => {
  const cite = (startSec: number, endSec: number, context: string) =>
    fileId ? ` ${jump(fileId, startSec, endSec, context)}` : "";
  return [
    `Bayes' theorem answers one question: how much should new evidence change what you already believe? Your lecture puts it in three pieces: a prior, a likelihood, and the evidence overall.${cite(9.5, 27, "Prior, likelihood, and posterior")}`,
    "",
    `Take the test from the lecture. Out of 1,000 people, 10 have the disease, and the test catches 9 of them. It also flags 9% of the 990 healthy people, about 89 more. So of the 98 positive results, only 9 are real.${cite(28, 47, "The disease test example")}`,
    "",
    "That's the whole mechanism: $P(\\text{sick} \\mid +) = \\frac{P(+ \\mid \\text{sick}) \\cdot P(\\text{sick})}{P(+)} = \\frac{0.9 \\times 0.01}{0.098} \\approx 9\\%$. The prior is small, so even a good test mostly finds false alarms.",
    "",
    "Try it below: change the base rate and the false positive rate, and watch how many positives are real.",
  ].join("\n");
};

const REVIEW_TEXT =
  "2 out of 2, nicely done. You moved the model until most positives were real, and you could say why the lecture's 9% is so low: the healthy majority produces most of the positive tests.\n\nWant a harder one? Try two tests in a row: what happens to the chance of being sick after a second positive result?";

const FALLBACK_TEXT =
  "This is demo mode, so I answer from a prepared lesson about Bayes' theorem. Record the demo lecture under Transcription, then turn on learning mode and ask me to teach you Bayes' theorem from your lecture.";

const findLectureFileId = (messages: readonly LocalChatMessage[]): string | null => {
  for (const message of messages) {
    for (const part of message.content) {
      if (part.type !== "tool_result") continue;
      const text = typeof part.result === "string" ? part.result : JSON.stringify(part.result);
      const match = /"(?:fileId|file_id)"\s*:\s*"([^"]+)"/.exec(text ?? "");
      if (match) return match[1];
    }
  }
  return null;
};

/** Chooses the next scripted reply from what the current turn has done so far. */
export const scriptDemoReply = (request: LocalChatRequest): ScriptedReply => {
  const lastUserIndex = request.messages.map((message) => message.role).lastIndexOf("user");
  const userText = textOf(request.messages[lastUserIndex]);

  // Titles, memory and recaps run without tools.
  if (request.tools.length === 0) {
    return { delayMs: 0, text: /title/i.test(userText) ? "Bayes' theorem from the lecture" : "" };
  }
  if (userText.startsWith("Lesson result:")) return { delayMs: 800, text: REVIEW_TEXT };
  if (!/bayes|teach|lecture|learn/i.test(userText)) return { delayMs: 600, text: FALLBACK_TEXT };

  const turn = request.messages.slice(lastUserIndex + 1);
  const called = new Set(
    turn.flatMap((message) =>
      message.content.flatMap((part) => (part.type === "tool_call" ? [part.name] : [])),
    ),
  );
  const fileId = findLectureFileId(turn);

  if (!called.has("search_transcript"))
    return {
      delayMs: 900,
      tools: [{ name: "search_transcript", args: { keyword: "Bayes", ignore_case: true } }],
    };
  if (fileId && !called.has("read_transcript"))
    return {
      delayMs: 700,
      tools: [{ name: "read_transcript", args: { file_id: fileId, start_sec: 0, end_sec: 60 } }],
    };
  if (!called.has("activate_skill"))
    return { delayMs: 600, tools: [{ name: "activate_skill", args: { name: SKILL } }] };
  if (!called.has("read_skill_resource"))
    return {
      delayMs: 500,
      tools: ["README.md", "guidelines/interactive.md", "guidelines/lesson.md"].map((path) => ({
        name: "read_skill_resource",
        args: { name: SKILL, path },
      })),
    };
  if (!called.has("show_widget"))
    return {
      delayMs: 700,
      text: lessonText(fileId),
      tools: [
        {
          name: "show_widget",
          args: {
            i_have_seen_read_me: true,
            title: "Bayes' theorem lesson",
            loading_messages: ["Placing 1,000 people", "Wiring up the sliders"],
            widget_code: BAYES_LESSON_WIDGET,
          },
        },
      ],
    };
  return { delayMs: 0, text: "" };
};

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

const estimateTokens = (value: unknown): number => Math.ceil(JSON.stringify(value).length / 4);

async function* streamDemoChat(
  request: LocalChatRequest,
  options?: { signal?: AbortSignal },
): AsyncGenerator<LocalChatEvent> {
  const reply = scriptDemoReply(request);
  yield { type: "status", status: "running" };
  await wait(reply.delayMs, options?.signal);
  const pieces = reply.text?.match(/\S+\s*|\s+/g) ?? [];
  for (let index = 0; index < pieces.length; index += 2) {
    yield { type: "text-delta", delta: pieces.slice(index, index + 2).join("") };
    await wait(25, options?.signal);
  }
  for (const [index, tool] of (reply.tools ?? []).entries()) {
    const id = `demo_${crypto.randomUUID()}_${index}`;
    yield { type: "tool-call-start", toolCall: { id, name: tool.name } };
    yield { type: "tool-call-complete", toolCall: { id, name: tool.name, arguments: tool.args } };
  }
  const inputTokens = estimateTokens(request.messages);
  const outputTokens = estimateTokens(reply);
  yield { type: "usage", inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
  yield { type: "chat-complete" };
}

/** A chat runtime that answers from the demo script instead of a provider. */
export const createDemoPiRuntime = (): PiModelRuntime =>
  createLocalPiRuntime({ client: { streamChat: streamDemoChat }, manifest: DEMO_CHAT_MANIFEST });
