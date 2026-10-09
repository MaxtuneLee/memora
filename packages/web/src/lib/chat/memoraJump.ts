import type { ChatWidget } from "@/lib/chat/showWidget";

export interface MediaJumpCardData {
  fileId: string;
  fileName: string;
  mediaType: "video" | "audio";
  startSec: number;
  endSec: number;
  context: string;
}

export type MemoraJumpContentPart =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "jump";
      jumpCard: MediaJumpCardData;
    };

const COMPLETE_MEMORA_JUMP_PATTERN =
  /```memora-jumps\s*([\s\S]*?)```|<memora-jump\b([\s\S]*?)\/>/gi;
const MEMORA_JUMP_TAG_ATTRIBUTE_PATTERN = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
  "#39": "'",
};

const decodeHtmlEntities = (value: string): string => {
  return value.replace(/&(#39|amp|apos|gt|lt|quot);/gi, (match, entity) => {
    const decoded = HTML_ENTITY_MAP[entity.toLowerCase()];
    return decoded ?? match;
  });
};

const normalizeTextPart = (value: string): string => {
  return value.replace(/\n{3,}/g, "\n\n");
};

export const parseMediaJumpCard = (value: unknown): MediaJumpCardData | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<MediaJumpCardData>;
  if (typeof candidate.fileId !== "string" || !candidate.fileId.trim()) {
    return null;
  }
  if (typeof candidate.fileName !== "string" || !candidate.fileName.trim()) {
    return null;
  }
  if (candidate.mediaType !== "video" && candidate.mediaType !== "audio") {
    return null;
  }
  if (
    typeof candidate.startSec !== "number" ||
    !Number.isFinite(candidate.startSec) ||
    candidate.startSec < 0
  ) {
    return null;
  }
  if (
    typeof candidate.endSec !== "number" ||
    !Number.isFinite(candidate.endSec) ||
    candidate.endSec < 0
  ) {
    return null;
  }

  return {
    fileId: candidate.fileId.trim(),
    fileName: candidate.fileName.trim(),
    mediaType: candidate.mediaType,
    startSec: candidate.startSec,
    endSec: Math.max(candidate.endSec, candidate.startSec),
    context: typeof candidate.context === "string" ? candidate.context.trim() : "",
  };
};

const parseLegacyMemoraJumpBlock = (blockPayload: string): MediaJumpCardData[] => {
  try {
    const parsed = JSON.parse(blockPayload) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const jumpCards: MediaJumpCardData[] = [];
    for (const item of parsed) {
      const jumpCard = parseMediaJumpCard(item);
      if (jumpCard) {
        jumpCards.push(jumpCard);
      }
    }

    return jumpCards;
  } catch {
    return [];
  }
};

const parseMemoraJumpTagAttributes = (rawAttributeText: string): Record<string, string> => {
  const attributes: Record<string, string> = {};

  for (const match of rawAttributeText.matchAll(MEMORA_JUMP_TAG_ATTRIBUTE_PATTERN)) {
    const key = match[1];
    const rawValue = match[2] ?? match[3] ?? "";
    attributes[key] = decodeHtmlEntities(rawValue);
  }

  return attributes;
};

const parseMemoraJumpTag = (rawAttributeText: string): MediaJumpCardData | null => {
  const attributes = parseMemoraJumpTagAttributes(rawAttributeText);
  const startSec =
    typeof attributes.startSec === "string" ? Number(attributes.startSec) : Number.NaN;
  const endSec = typeof attributes.endSec === "string" ? Number(attributes.endSec) : Number.NaN;

  return parseMediaJumpCard({
    fileId: attributes.fileId,
    fileName: attributes.fileName,
    mediaType: attributes.mediaType,
    startSec,
    endSec,
    context: attributes.context ?? "",
  });
};

const stripTrailingIncompleteMemoraJumpMarkup = (value: string): string => {
  let nextValue = value;

  while (true) {
    const lowerValue = nextValue.toLowerCase();
    const legacyStart = lowerValue.lastIndexOf("```memora-jumps");
    const legacyClose =
      legacyStart >= 0 ? nextValue.indexOf("```", legacyStart + "```memora-jumps".length) : -1;
    const tagStart = lowerValue.lastIndexOf("<memora-jump");
    const tagClose = tagStart >= 0 ? nextValue.indexOf("/>", tagStart) : -1;

    const incompleteStarts = [
      legacyStart >= 0 && legacyClose === -1 ? legacyStart : -1,
      tagStart >= 0 && tagClose === -1 ? tagStart : -1,
    ].filter((index) => index >= 0);

    if (incompleteStarts.length === 0) {
      return nextValue;
    }

    const cutIndex = Math.max(...incompleteStarts);
    nextValue = nextValue.slice(0, cutIndex);
  }
};

const pushTextPart = (parts: MemoraJumpContentPart[], text: string): void => {
  const normalizedText = normalizeTextPart(text);
  if (!normalizedText.trim()) {
    return;
  }

  const previousPart = parts.at(-1);
  if (previousPart?.type === "text") {
    previousPart.content = `${previousPart.content}${normalizedText}`;
    return;
  }

  parts.push({
    type: "text",
    content: normalizedText,
  });
};

export const parseMemoraJumpContent = (content: string): MemoraJumpContentPart[] => {
  const source = content ?? "";
  const parts: MemoraJumpContentPart[] = [];
  let cursor = 0;

  for (const match of source.matchAll(COMPLETE_MEMORA_JUMP_PATTERN)) {
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) {
      continue;
    }

    pushTextPart(parts, source.slice(cursor, matchIndex));

    if (typeof match[1] === "string") {
      const jumpCards = parseLegacyMemoraJumpBlock(match[1]);
      for (const jumpCard of jumpCards) {
        parts.push({
          type: "jump",
          jumpCard,
        });
      }
    } else if (typeof match[2] === "string") {
      const jumpCard = parseMemoraJumpTag(match[2]);
      if (jumpCard) {
        parts.push({
          type: "jump",
          jumpCard,
        });
      }
    }

    cursor = matchIndex + match[0].length;
  }

  pushTextPart(parts, stripTrailingIncompleteMemoraJumpMarkup(source.slice(cursor)));

  return parts;
};

export const stripMemoraJumpMarkup = (content: string): string => {
  return parseMemoraJumpContent(content)
    .filter((part): part is Extract<MemoraJumpContentPart, { type: "text" }> => {
      return part.type === "text";
    })
    .map((part) => part.content)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const MEMORA_CITE_TAG = "memora-cite";

export interface CitedMarkdown {
  markdown: string;
  /** citations[n - 1] holds the moments behind the marker numbered n. */
  citations: MediaJumpCardData[][];
}

// A marker after these lines would break the block, so it gets its own paragraph.
const BLOCK_LINE_PATTERN = /^(```|~~~|\||\$\$)/;

/** Replaces each run of adjacent jump tags with one numbered citation marker after the text it follows. */
// `firstIndex` numbers citations on from an earlier part of the same message.
export const buildCitedMarkdown = (content: string, firstIndex = 1): CitedMarkdown => {
  const citations: MediaJumpCardData[][] = [];
  let markdown = "";
  let group: MediaJumpCardData[] = [];

  const flush = (): void => {
    if (group.length === 0) return;
    citations.push(group);
    group = [];
    const marker = `<${MEMORA_CITE_TAG} index="${firstIndex - 1 + citations.length}"></${MEMORA_CITE_TAG}>`;
    const body = markdown.trimEnd();
    const trailing = markdown.slice(body.length);
    const lastLine = body.slice(body.lastIndexOf("\n") + 1).trimStart();
    markdown =
      !body || BLOCK_LINE_PATTERN.test(lastLine)
        ? `${body}${body ? "\n\n" : ""}${marker}${trailing}`
        : `${body}${marker}${trailing}`;
  };

  for (const part of parseMemoraJumpContent(content)) {
    if (part.type === "jump") {
      group.push(part.jumpCard);
      continue;
    }
    flush();
    markdown += part.content;
  }
  flush();

  return { markdown: markdown.replace(/\n{3,}/g, "\n\n").trimEnd(), citations };
};

export const getMediaJumpHref = (jumpCard: MediaJumpCardData): string => {
  return `/transcript/file/${jumpCard.fileId}?seek=${encodeURIComponent(String(jumpCard.startSec))}`;
};

export type ContentBlock =
  | { type: "text"; key: string; markdown: string }
  | { type: "widget"; key: string; widget: ChatWidget };

// Splits the message text at each widget's anchor, so a widget shows where it was called.
// Widgets saved before anchors existed have none and stay at the top, as they used to.
export const buildContentBlocks = (
  content: string,
  widgets: ChatWidget[] = [],
): { blocks: ContentBlock[]; citations: CitedMarkdown["citations"] } => {
  const blocks: ContentBlock[] = [];
  const citations: CitedMarkdown["citations"] = [];
  const pushText = (text: string, key: string): void => {
    const cited = buildCitedMarkdown(text, citations.length + 1);
    citations.push(...cited.citations);
    const markdown = cited.markdown.replace(/^\n+/, "");
    if (markdown.trim()) blocks.push({ type: "text", key, markdown });
  };
  const anchored = widgets
    .map((widget) => ({ widget, offset: Math.min(widget.contentOffset ?? 0, content.length) }))
    .sort((left, right) => left.offset - right.offset);

  let cursor = 0;
  for (const { widget, offset } of anchored) {
    pushText(content.slice(cursor, offset), `text:${cursor}`);
    blocks.push({ type: "widget", key: widget.toolCallId, widget });
    cursor = Math.max(cursor, offset);
  }
  pushText(content.slice(cursor), `text:${cursor}`);
  return { blocks, citations };
};
