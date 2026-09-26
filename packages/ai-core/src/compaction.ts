import type { AgentMessage, AgentMessageContent } from "./types";

/**
 * Compaction changes how the stored history is rendered for the model, never the history
 * itself, so every original stays recallable. See docs/agent-context-compaction.md.
 *
 * The persisted state holds two inclusive message IDs. Rendering is a pure function of the
 * history and this state, so the request stays byte-identical between compaction events and
 * the provider prompt cache keeps hitting.
 */
export interface CompactionState {
  /** Messages up to and including this ID render in their shortened form. */
  compactedThrough?: string;
  /** Messages up to and including this ID render without provider replay data or reasoning. */
  strippedThrough?: string;
}

type ImageContent = Extract<AgentMessageContent, { type: "image" }>;
type ToolResultContent = Extract<AgentMessageContent, { type: "tool_result" }>;

interface Limits {
  threshold: number;
  head: number;
  tail: number;
}

export const RECALL_TOOL_NAME = "recall_message";

/** Every tool result, from the first time it is sent. */
const WRITE_LIMITS: Limits = { threshold: 8_000, head: 6_000, tail: 1_500 };
/** Tool results, assistant text, and tool-call string arguments in compacted messages. */
const COMPACT_LIMITS: Limits = { threshold: 2_000, head: 1_000, tail: 500 };
/** Recall pages stay under the write limit so a recalled page is never shortened again. */
const RECALL_PAGE_CHARS = 7_000;
/** The newest user turns, counting the one being answered, are never compacted. */
const PROTECTED_TURNS = 3;
/** Stored tool results are capped so one huge output cannot bloat the session file. */
export const STORED_TOOL_RESULT_MAX_CHARS = 100_000;
/** Compact once the estimate passes this share of the input budget. */
export const HIGH_WATERMARK = 0.8;
/** A compaction must free this share of the input budget to be worth a cache rewrite. */
export const MIN_SAVINGS = 0.1;

const stringify = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

const shorten = (text: string, limits: Limits, recallId: string): string => {
  if (text.length <= limits.threshold) return text;
  let headEnd = limits.head;
  if (isHighSurrogate(text.charCodeAt(headEnd - 1))) headEnd -= 1;
  let tailStart = text.length - limits.tail;
  if (isHighSurrogate(text.charCodeAt(tailStart - 1))) tailStart += 1;
  const omitted = (tailStart - headEnd).toLocaleString("en-US");
  return `${text.slice(0, headEnd)}\n…[omitted ${omitted} characters, recall ID: ${recallId}]…\n${text.slice(tailStart)}`;
};

const shortenStrings = (value: unknown, limits: Limits, recallId: string): unknown => {
  if (typeof value === "string") return shorten(value, limits, recallId);
  if (Array.isArray(value)) return value.map((item) => shortenStrings(item, limits, recallId));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shortenStrings(item, limits, recallId)]),
    );
  return value;
};

const imagePlaceholder = (image: ImageContent, recallId: string): string =>
  `[${image.mimeType} image omitted, recall ID: ${recallId}]`;

/** The most recent image is usually what the user is still asking about, so it is kept. */
const findLatestImage = (messages: AgentMessage[]): ImageContent | undefined => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const content = messages[index]!.content;
    for (let block = content.length - 1; block >= 0; block--) {
      const item = content[block]!;
      if (item.type === "image") return item;
      if (item.type === "tool_result" && item.images?.length)
        return item.images[item.images.length - 1];
    }
  }
  return undefined;
};

const projectToolResult = (
  result: ToolResultContent,
  compacted: boolean,
  keptImage: ImageContent | undefined,
): ToolResultContent => {
  const limits = compacted ? COMPACT_LIMITS : WRITE_LIMITS;
  const text = stringify(result.result);
  const images = compacted ? result.images?.filter((image) => image === keptImage) : result.images;
  const omittedImages = (result.images?.length ?? 0) - (images?.length ?? 0);
  if (text.length <= limits.threshold && omittedImages === 0) return result;
  const shortened = shorten(text, limits, result.id);
  const { images: _images, ...rest } = result;
  return {
    ...rest,
    result:
      omittedImages > 0
        ? `${shortened}\n[${omittedImages} image(s) omitted, recall ID: ${result.id}]`
        : shortened,
    ...(images?.length ? { images } : {}),
  };
};

const projectMessage = (
  message: AgentMessage,
  compacted: boolean,
  stripped: boolean,
  keptImage: ImageContent | undefined,
): AgentMessage => {
  // Tool messages rebuild losslessly from content, and their stored provider copy holds the
  // untrimmed result.
  if (message.role === "tool" || message.content.some((item) => item.type === "tool_result")) {
    const { providerMessage: _providerMessage, ...rest } = message;
    return {
      ...rest,
      content: message.content.map((item) =>
        item.type === "tool_result" ? projectToolResult(item, compacted, keptImage) : item,
      ),
    };
  }
  if (!compacted && !stripped) return message;
  const { providerMessage: _providerMessage, reasoning: _reasoning, ...rest } = message;
  if (!compacted) return rest;
  return {
    ...rest,
    content: message.content.map((item): AgentMessageContent => {
      if (item.type === "image" && item !== keptImage)
        return { type: "text", text: imagePlaceholder(item, message.id) };
      if (message.role !== "assistant") return item;
      if (item.type === "text")
        return { ...item, text: shorten(item.text, COMPACT_LIMITS, message.id) };
      if (item.type === "tool_call")
        return {
          ...item,
          arguments: shortenStrings(item.arguments, COMPACT_LIMITS, message.id) as Record<
            string,
            unknown
          >,
        };
      return item;
    }),
  };
};

/** Render the stored history as the model sees it. */
export const projectHistory = (
  messages: AgentMessage[],
  state: CompactionState,
): AgentMessage[] => {
  const compactedEnd = state.compactedThrough
    ? messages.findIndex((message) => message.id === state.compactedThrough)
    : -1;
  const strippedEnd = state.strippedThrough
    ? messages.findIndex((message) => message.id === state.strippedThrough)
    : -1;
  const keptImage = findLatestImage(messages);
  return messages.map((message, index) =>
    projectMessage(
      message,
      index <= compactedEnd,
      index <= Math.max(strippedEnd, compactedEnd),
      keptImage,
    ),
  );
};

/**
 * True when a new turn starts: the last message is user input that does not follow a tool
 * result. A tool round in progress keeps its reasoning intact, so it is never compacted.
 */
export const isTurnStart = (messages: AgentMessage[]): boolean =>
  messages[messages.length - 1]?.role === "user" && messages[messages.length - 2]?.role !== "tool";

/**
 * The next state at a turn start: compact everything before the protected recent turns and
 * strip reasoning from every completed turn. Returns undefined when nothing would change.
 */
export const planCompaction = (
  messages: AgentMessage[],
  state: CompactionState,
): CompactionState | undefined => {
  const indexOf = (id: string | undefined) =>
    id ? messages.findIndex((message) => message.id === id) : -1;
  const userIndexes = messages.flatMap((message, index) =>
    message.role === "user" ? [index] : [],
  );
  const protectedStart = userIndexes[userIndexes.length - PROTECTED_TURNS] ?? 0;
  const compactedEnd = Math.max(protectedStart - 1, indexOf(state.compactedThrough));
  const strippedEnd = Math.max(messages.length - 2, indexOf(state.strippedThrough));
  const next: CompactionState = {
    ...(compactedEnd >= 0 ? { compactedThrough: messages[compactedEnd]!.id } : {}),
    ...(strippedEnd >= 0 ? { strippedThrough: messages[strippedEnd]!.id } : {}),
  };
  return next.compactedThrough === state.compactedThrough &&
    next.strippedThrough === state.strippedThrough
    ? undefined
    : next;
};

/**
 * Keep the state consistent after the history is rewritten, for example when an earlier
 * message is edited and resent. An ID that no longer exists means the rewrite cut before it,
 * so every kept message was already sent in that form; the last kept message takes its place.
 */
export const rebaseCompaction = (
  state: CompactionState | null | undefined,
  messages: AgentMessage[],
): CompactionState => {
  const last = messages[messages.length - 1]?.id;
  const rebase = (id: string | undefined) =>
    !id || messages.some((message) => message.id === id) ? id : last;
  const compactedThrough = rebase(state?.compactedThrough);
  const strippedThrough = rebase(state?.strippedThrough);
  return {
    ...(compactedThrough ? { compactedThrough } : {}),
    ...(strippedThrough ? { strippedThrough } : {}),
  };
};

/** Recall output carries images separately so the loop can attach them to the tool result. */
export class RecallOutput {
  constructor(
    readonly text: string,
    readonly images: ImageContent[],
  ) {}
}

const renderContent = (content: AgentMessageContent[]): string =>
  content
    .flatMap((item) => {
      switch (item.type) {
        case "text":
          return [item.text];
        case "tool_call":
          return [`Tool call ${item.name} (${item.id}): ${JSON.stringify(item.arguments)}`];
        case "tool_result":
          return [`Result of ${item.name} (${item.id}): ${stringify(item.result)}`];
        case "file":
          return [`[file ${item.name}]`];
        default:
          return [];
      }
    })
    .join("\n\n");

/** Original content for a recall ID: a tool call ID, or a message ID. */
export const recallMessage = (
  messages: AgentMessage[],
  args: { id: string; start?: number; end?: number },
): RecallOutput => {
  let text: string | undefined;
  let images: ImageContent[] = [];
  for (const message of messages) {
    const result = message.content.find(
      (item): item is ToolResultContent => item.type === "tool_result" && item.id === args.id,
    );
    if (result) {
      text = stringify(result.result);
      images = result.images ?? [];
      break;
    }
  }
  if (text === undefined) {
    const message = messages.find((item) => item.id === args.id);
    if (!message) throw new Error(`No message or tool result has recall ID ${args.id}.`);
    text = renderContent(message.content);
    images = message.content.filter((item): item is ImageContent => item.type === "image");
  }
  const start = Math.min(args.start ?? 0, text.length);
  const end = Math.min(args.end ?? text.length, start + RECALL_PAGE_CHARS, text.length);
  const page = text.slice(start, end);
  const more =
    end < text.length
      ? `\n\n[Showing characters ${start}–${end} of ${text.length}. Call ${RECALL_TOOL_NAME} again with start=${end} for more.]`
      : "";
  return new RecallOutput(page + more, start === 0 ? images : []);
};
