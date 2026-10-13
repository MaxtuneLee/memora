import { createEditor } from "lexical";

import {
  RAW_MARKDOWN_END,
  RAW_MARKDOWN_START,
  WYSIWYG_NODES,
  exportWysiwygMarkdown,
  importWysiwygMarkdown,
} from "@/lib/editor/wysiwygMarkdownConfig";

const LINE_ENDING_PATTERN = /\r\n?|\n/g;

const stripSingleTrailingNewline = (text: string): string => {
  if (!text.endsWith("\n")) {
    return text;
  }

  return text.slice(0, -1);
};

const stripSingleTrailingLineEnding = (text: string): string => {
  if (text.endsWith("\r\n")) {
    return text.slice(0, -2);
  }
  if (text.endsWith("\n") || text.endsWith("\r")) {
    return text.slice(0, -1);
  }
  return text;
};

export const normalizeMarkdownRoundTripText = (text: string): string => {
  return stripSingleTrailingNewline(text.replace(LINE_ENDING_PATTERN, "\n"));
};

interface ContentLine {
  /** Whether a blank line separates this line from the previous non-blank line. */
  blankBefore: boolean;
  /** 1-based line number in the text. */
  line: number;
  text: string;
}

const toContentLines = (text: string): ContentLine[] => {
  const lines: ContentLine[] = [];
  let blank = false;
  for (const [index, line] of normalizeMarkdownRoundTripText(text).split("\n").entries()) {
    if (line.trim() === "") {
      blank = true;
      continue;
    }
    lines.push({ blankBefore: blank && lines.length > 0, line: index + 1, text: line });
    blank = false;
  }
  return lines;
};

// Lines that start a block even right after a paragraph line, and lines that end their block.
const BLOCK_START_REGEXP = /^(\s*(#{1,6}(\s|$)|[-*+]\s|\d+[.)]\s|>|`{3,}|~{3,}|\|)|\$\$)/;
const BLOCK_END_REGEXP =
  /^\s*(#{1,6}(\s|$)|`{3,}\s*$|~{3,}\s*$|([-*_])(\s*\3){2,}\s*$|\$\$\s*$)|^\$\$.*\$\$\s*$/;

const isBlockBoundary = (previous: string, next: string): boolean => {
  return BLOCK_END_REGEXP.test(previous) || BLOCK_START_REGEXP.test(next);
};

/**
 * Lines of `before` where `after` adds or removes the blank line in front of them inside a
 * block, splitting a paragraph or joining two. Blank lines at block boundaries, such as after a
 * heading or before a list, do not change the rendered note. Returns null when the non-blank
 * lines themselves differ.
 */
export const findParagraphBreakChanges = (before: string, after: string): ContentLine[] | null => {
  const beforeLines = toContentLines(before);
  const afterLines = toContentLines(after);
  if (
    beforeLines.length !== afterLines.length ||
    beforeLines.some((line, index) => line.text !== afterLines[index]?.text)
  ) {
    return null;
  }
  return beforeLines.filter((line, index) => {
    const previous = beforeLines[index - 1];
    return (
      previous !== undefined &&
      line.blankBefore !== afterLines[index]?.blankBefore &&
      !isBlockBoundary(previous.text, line.text)
    );
  });
};

/** Whether converting `before` to `after` keeps every line and paragraph of the note. */
export const isMarkdownRoundTripSafe = (before: string, after: string): boolean => {
  return findParagraphBreakChanges(before, after)?.length === 0;
};

export interface MarkdownSafetyDiagnostic {
  column: number;
  from: number;
  line: number;
  message: string;
  replacementText: string;
  sourceText: string;
  to: number;
}

interface MarkdownLine {
  end: number;
  start: number;
  text: string;
}

interface ChangedLineBlock {
  originalEnd: number;
  originalStart: number;
  replacementEnd: number;
  replacementStart: number;
}

const MAX_LCS_CELLS = 250_000;
const MAX_DIAGNOSTIC_SNIPPET_LENGTH = 56;

const splitMarkdownLines = (text: string): MarkdownLine[] => {
  const lines: MarkdownLine[] = [];
  const newlinePattern = /\r\n?|\n/g;
  let lineStart = 0;
  let match: RegExpExecArray | null;

  while ((match = newlinePattern.exec(text)) !== null) {
    lines.push({
      end: match.index,
      start: lineStart,
      text: text.slice(lineStart, match.index),
    });
    lineStart = match.index + match[0].length;
  }

  lines.push({
    end: text.length,
    start: lineStart,
    text: text.slice(lineStart),
  });
  return lines;
};

const collectChangedLineBlocks = (
  originalLines: readonly MarkdownLine[],
  replacementLines: readonly MarkdownLine[],
): ChangedLineBlock[] => {
  const originalCount = originalLines.length;
  const replacementCount = replacementLines.length;
  if (originalCount * replacementCount > MAX_LCS_CELLS) {
    if (originalCount === replacementCount) {
      const blocks: ChangedLineBlock[] = [];
      let activeBlock: ChangedLineBlock | null = null;

      for (let index = 0; index < originalCount; index += 1) {
        if (originalLines[index]?.text === replacementLines[index]?.text) {
          if (activeBlock) {
            blocks.push(activeBlock);
            activeBlock = null;
          }
          continue;
        }

        activeBlock ??= {
          originalEnd: index,
          originalStart: index,
          replacementEnd: index,
          replacementStart: index,
        };
        activeBlock.originalEnd = index + 1;
        activeBlock.replacementEnd = index + 1;
      }

      if (activeBlock) {
        blocks.push(activeBlock);
      }
      return blocks;
    }

    let prefix = 0;
    while (
      prefix < originalCount &&
      prefix < replacementCount &&
      originalLines[prefix]?.text === replacementLines[prefix]?.text
    ) {
      prefix += 1;
    }

    let suffix = 0;
    while (
      suffix < originalCount - prefix &&
      suffix < replacementCount - prefix &&
      originalLines[originalCount - suffix - 1]?.text ===
        replacementLines[replacementCount - suffix - 1]?.text
    ) {
      suffix += 1;
    }

    return [
      {
        originalEnd: originalCount - suffix,
        originalStart: prefix,
        replacementEnd: replacementCount - suffix,
        replacementStart: prefix,
      },
    ];
  }

  const lcs = Array.from(
    { length: originalCount + 1 },
    () => new Uint32Array(replacementCount + 1),
  );
  for (let originalIndex = originalCount - 1; originalIndex >= 0; originalIndex -= 1) {
    for (
      let replacementIndex = replacementCount - 1;
      replacementIndex >= 0;
      replacementIndex -= 1
    ) {
      lcs[originalIndex]![replacementIndex] =
        originalLines[originalIndex]?.text === replacementLines[replacementIndex]?.text
          ? (lcs[originalIndex + 1]?.[replacementIndex + 1] ?? 0) + 1
          : Math.max(
              lcs[originalIndex + 1]?.[replacementIndex] ?? 0,
              lcs[originalIndex]?.[replacementIndex + 1] ?? 0,
            );
    }
  }

  const blocks: ChangedLineBlock[] = [];
  let originalIndex = 0;
  let replacementIndex = 0;
  let activeBlock: ChangedLineBlock | null = null;
  const flushBlock = (): void => {
    if (activeBlock) {
      blocks.push(activeBlock);
      activeBlock = null;
    }
  };
  const extendBlock = (): ChangedLineBlock => {
    activeBlock ??= {
      originalEnd: originalIndex,
      originalStart: originalIndex,
      replacementEnd: replacementIndex,
      replacementStart: replacementIndex,
    };
    return activeBlock;
  };

  while (originalIndex < originalCount || replacementIndex < replacementCount) {
    if (
      originalIndex < originalCount &&
      replacementIndex < replacementCount &&
      originalLines[originalIndex]?.text === replacementLines[replacementIndex]?.text
    ) {
      flushBlock();
      originalIndex += 1;
      replacementIndex += 1;
      continue;
    }

    const block = extendBlock();
    if (
      replacementIndex >= replacementCount ||
      (originalIndex < originalCount &&
        (lcs[originalIndex + 1]?.[replacementIndex] ?? 0) >=
          (lcs[originalIndex]?.[replacementIndex + 1] ?? 0))
    ) {
      originalIndex += 1;
      block.originalEnd = originalIndex;
    } else {
      replacementIndex += 1;
      block.replacementEnd = replacementIndex;
    }
  }
  flushBlock();
  return blocks;
};

const getOffsetLine = (lines: readonly MarkdownLine[], offset: number): number => {
  const lineIndex = lines.findIndex((line) => offset <= line.end);
  return lineIndex === -1 ? lines.length : lineIndex + 1;
};

const formatDiagnosticSnippet = (text: string): string => {
  const singleLineText = text.replace(LINE_ENDING_PATTERN, "\\n");
  const truncatedText =
    singleLineText.length > MAX_DIAGNOSTIC_SNIPPET_LENGTH
      ? `${singleLineText.slice(0, MAX_DIAGNOSTIC_SNIPPET_LENGTH - 1)}…`
      : singleLineText;
  return JSON.stringify(truncatedText);
};

const buildDiagnosticMessage = (
  line: number,
  sourceText: string,
  replacementText: string,
): string => {
  if (!sourceText) {
    return `Line ${line}: ${formatDiagnosticSnippet(replacementText)} would be inserted.`;
  }
  if (!replacementText) {
    return `Line ${line}: ${formatDiagnosticSnippet(sourceText)} would be removed.`;
  }
  return `Line ${line}: ${formatDiagnosticSnippet(sourceText)} would become ${formatDiagnosticSnippet(replacementText)}.`;
};

const createChangedBlockDiagnostic = (
  original: string,
  replacement: string,
  originalLines: readonly MarkdownLine[],
  replacementLines: readonly MarkdownLine[],
  block: ChangedLineBlock,
): MarkdownSafetyDiagnostic => {
  const originalLine = originalLines[block.originalStart];
  const replacementLine = replacementLines[block.replacementStart];
  const isSingleLineReplacement =
    block.originalEnd - block.originalStart === 1 &&
    block.replacementEnd - block.replacementStart === 1 &&
    originalLine !== undefined &&
    replacementLine !== undefined;
  const isPureLineInsertion = block.originalStart === block.originalEnd;
  const isPureLineDeletion = block.replacementStart === block.replacementEnd;

  let from = originalLine?.start ?? original.length;
  let to = isPureLineInsertion ? from : (originalLines[block.originalEnd - 1]?.end ?? from);
  let replacementFrom = replacementLine?.start ?? replacement.length;
  let replacementTo = isPureLineDeletion
    ? replacementFrom
    : (replacementLines[block.replacementEnd - 1]?.end ?? replacementFrom);

  if (isSingleLineReplacement) {
    let prefixLength = 0;
    while (
      prefixLength < originalLine.text.length &&
      prefixLength < replacementLine.text.length &&
      originalLine.text[prefixLength] === replacementLine.text[prefixLength]
    ) {
      prefixLength += 1;
    }

    let suffixLength = 0;
    while (
      suffixLength < originalLine.text.length - prefixLength &&
      suffixLength < replacementLine.text.length - prefixLength &&
      originalLine.text[originalLine.text.length - suffixLength - 1] ===
        replacementLine.text[replacementLine.text.length - suffixLength - 1]
    ) {
      suffixLength += 1;
    }

    from = originalLine.start + prefixLength;
    to = originalLine.end - suffixLength;
    replacementFrom = replacementLine.start + prefixLength;
    replacementTo = replacementLine.end - suffixLength;

    if (from === to && originalLine.text.length > 0) {
      const expandedFrom = Math.max(originalLine.start, from - 1);
      const expandedTo = Math.min(originalLine.end, to + 1);
      replacementFrom = Math.max(replacementLine.start, replacementFrom - (from - expandedFrom));
      replacementTo = Math.min(replacementLine.end, replacementTo + (expandedTo - to));
      from = expandedFrom;
      to = expandedTo;
    }
  } else if (from === to && original.length > 0) {
    if (from < original.length && original[from] !== "\n" && original[from] !== "\r") {
      to = from + 1;
    } else {
      from = Math.max(0, from - 1);
      to = Math.max(from + 1, to);
    }
  }

  const sourceText = isPureLineInsertion ? "" : original.slice(from, to);
  const replacementText = replacement.slice(replacementFrom, replacementTo);
  const line = getOffsetLine(originalLines, from);
  const containingLine = originalLines[Math.max(0, line - 1)];
  const column = from - (containingLine?.start ?? 0) + 1;
  return {
    column,
    from,
    line,
    message: buildDiagnosticMessage(line, sourceText, replacementText),
    replacementText,
    sourceText,
    to,
  };
};

export const createMarkdownSafetyDiagnostics = (
  original: string,
  replacement: string,
): MarkdownSafetyDiagnostic[] => {
  const originalLines = splitMarkdownLines(original);
  const replacementLines = splitMarkdownLines(replacement);
  return collectChangedLineBlocks(originalLines, replacementLines).map((block) => {
    return createChangedBlockDiagnostic(
      original,
      replacement,
      originalLines,
      replacementLines,
      block,
    );
  });
};

export type MarkdownPreflightResult =
  | {
      safe: true;
      roundTrippedText: string;
      /**
       * The Markdown to load into Preview when some blocks are kept as editable source, with
       * those blocks marked. The diagnostics say why each one could not be converted.
       */
      importMarkdown?: string;
      diagnostics?: readonly MarkdownSafetyDiagnostic[];
    }
  | {
      safe: false;
      reason: "content-changed" | "conversion-error";
      diagnostics?: readonly MarkdownSafetyDiagnostic[];
      roundTrippedText?: string;
    };

type MarkdownWysiwygConverter = (markdown: string) => string;

const convertMarkdownWithProductionRegistry: MarkdownWysiwygConverter = (markdown) => {
  const editor = createEditor({
    nodes: WYSIWYG_NODES,
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      importWysiwygMarkdown(markdown);
    },
    { discrete: true },
  );

  return exportWysiwygMarkdown(editor.getEditorState());
};

interface LineRange {
  end: number;
  start: number;
}

const CODE_FENCE_OPEN_REGEXP = /^(`{3,}|~{3,})/;

/**
 * Splits Markdown into blocks separated by blank lines, 0-based [start, end) line ranges. Fenced
 * code and $$ math stay in one block even when they contain blank lines.
 */
export const splitMarkdownBlocks = (lines: readonly string[]): LineRange[] => {
  const blocks: LineRange[] = [];
  let start = -1;
  let fenceClose: RegExp | null = null;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (fenceClose) {
      if (fenceClose.test(trimmed)) {
        fenceClose = null;
      }
      continue;
    }
    if (trimmed === "") {
      if (start !== -1) {
        blocks.push({ end: index, start });
        start = -1;
      }
      continue;
    }
    if (start === -1) {
      start = index;
    }

    const codeFence = trimmed.match(CODE_FENCE_OPEN_REGEXP)?.[1];
    if (codeFence) {
      fenceClose = new RegExp(`^${codeFence[0] === "`" ? "`" : "~"}{${codeFence.length},}\\s*$`);
    } else if (trimmed.startsWith("$$") && !trimmed.slice(2).includes("$$")) {
      fenceClose = /\$\$\s*$/;
    }
  }

  if (start !== -1) {
    blocks.push({ end: lines.length, start });
  }
  return blocks;
};

const LINE_BREAKS_ONLY_REGEXP = /^[\r\n]*$/;

/**
 * Lays the converted lines out on the original's blank lines, so a blank line the converter added
 * or dropped does not shift every later line in the line diff.
 */
const alignToOriginalBlankLines = (original: string, converted: string): string => {
  const convertedLines = converted.split("\n").filter((line) => line.trim() !== "");
  let next = 0;
  const aligned = original
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : (convertedLines[next++] ?? "")));
  return [...aligned, ...convertedLines.slice(next)].join("\n");
};

// Blank lines count only where they split or join a paragraph; other changes count as found.
const createContentDiagnostics = (
  original: string,
  roundTrippedText: string,
): MarkdownSafetyDiagnostic[] => {
  const converted = stripSingleTrailingLineEnding(roundTrippedText);
  const paragraphBreaks = findParagraphBreakChanges(original, converted);
  if (paragraphBreaks) {
    const lines = splitMarkdownLines(original);
    return paragraphBreaks.map(({ blankBefore, line, text }) => {
      const from = lines[line - 1]?.start ?? 0;
      return {
        column: 1,
        from,
        line,
        message: blankBefore
          ? `Line ${line}: the blank line before it would be removed, joining it to the paragraph above.`
          : `Line ${line}: a blank line would be added before it, splitting the paragraph.`,
        replacementText: blankBefore ? text : `\n${text}`,
        sourceText: text,
        to: from + text.length,
      };
    });
  }
  return createMarkdownSafetyDiagnostics(
    original,
    alignToOriginalBlankLines(original, converted),
  ).filter(
    (diagnostic) =>
      !LINE_BREAKS_ONLY_REGEXP.test(diagnostic.sourceText) ||
      !LINE_BREAKS_ONLY_REGEXP.test(diagnostic.replacementText),
  );
};

// Each pass keeps more blocks as source; a few passes cover notes where one fix exposes another.
const MAX_RAW_BLOCK_PASSES = 6;

const markRawBlocks = (
  lines: readonly string[],
  blocks: readonly LineRange[],
  rawBlocks: ReadonlySet<LineRange>,
): string => {
  const output: string[] = [];
  let lineIndex = 0;
  for (const block of blocks) {
    output.push(...lines.slice(lineIndex, block.start));
    const blockLines = lines.slice(block.start, block.end);
    output.push(
      ...(rawBlocks.has(block)
        ? [RAW_MARKDOWN_START, ...blockLines, RAW_MARKDOWN_END]
        : blockLines),
    );
    lineIndex = block.end;
  }
  output.push(...lines.slice(lineIndex));
  return output.join("\n");
};

// The blocks a diagnostic touches; one on a blank line touches the blocks on either side.
const findDiagnosticBlocks = (
  blocks: readonly LineRange[],
  diagnostic: MarkdownSafetyDiagnostic,
): LineRange[] => {
  const lineIndex = diagnostic.line - 1;
  const containing = blocks.find((block) => block.start <= lineIndex && lineIndex < block.end);
  if (containing) {
    return [containing];
  }
  const before = blocks.findLast((block) => block.end <= lineIndex);
  const after = blocks.find((block) => block.start > lineIndex);
  return [before, after].filter((block): block is LineRange => block !== undefined);
};

export const preflightMarkdownForWysiwyg = (
  markdown: string,
  convertMarkdown: MarkdownWysiwygConverter = convertMarkdownWithProductionRegistry,
): MarkdownPreflightResult => {
  let roundTrippedText: string;
  try {
    roundTrippedText = convertMarkdown(markdown);
  } catch {
    return { reason: "conversion-error", safe: false };
  }
  if (isMarkdownRoundTripSafe(markdown, roundTrippedText)) {
    return { roundTrippedText, safe: true };
  }

  const original = stripSingleTrailingLineEnding(markdown);
  const diagnostics = createContentDiagnostics(original, roundTrippedText);
  const unsafe: MarkdownPreflightResult = {
    diagnostics,
    reason: "content-changed",
    roundTrippedText,
    safe: false,
  };

  // Keep the blocks that change as editable source and convert the rest.
  const lines = markdown.split("\n");
  const blocks = splitMarkdownBlocks(lines);
  const rawBlocks = new Set<LineRange>();
  let passDiagnostics = diagnostics;
  for (let pass = 0; pass < MAX_RAW_BLOCK_PASSES; pass += 1) {
    const sizeBefore = rawBlocks.size;
    for (const diagnostic of passDiagnostics) {
      for (const block of findDiagnosticBlocks(blocks, diagnostic)) {
        rawBlocks.add(block);
      }
    }
    if (rawBlocks.size === sizeBefore) {
      return unsafe;
    }

    const importMarkdown = markRawBlocks(lines, blocks, rawBlocks);
    let markedRoundTrip: string;
    try {
      markedRoundTrip = convertMarkdown(importMarkdown);
    } catch {
      return unsafe;
    }
    if (isMarkdownRoundTripSafe(markdown, markedRoundTrip)) {
      return { diagnostics, importMarkdown, roundTrippedText: markedRoundTrip, safe: true };
    }
    passDiagnostics = createContentDiagnostics(original, markedRoundTrip);
  }
  return unsafe;
};

/** The Markdown to load into Preview: the note itself, or with unconvertible blocks marked. */
export const prepareMarkdownForWysiwyg = (markdown: string): string => {
  const result = preflightMarkdownForWysiwyg(markdown);
  return result.safe ? (result.importMarkdown ?? markdown) : markdown;
};
