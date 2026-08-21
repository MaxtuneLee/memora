import { createEditor } from "lexical";

import {
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

export const isMarkdownRoundTripSafe = (before: string, after: string): boolean => {
  return normalizeMarkdownRoundTripText(before) === normalizeMarkdownRoundTripText(after);
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
  | { safe: true; roundTrippedText: string }
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

export const preflightMarkdownForWysiwyg = (
  markdown: string,
  convertMarkdown: MarkdownWysiwygConverter = convertMarkdownWithProductionRegistry,
): MarkdownPreflightResult => {
  try {
    const roundTrippedText = convertMarkdown(markdown);
    if (isMarkdownRoundTripSafe(markdown, roundTrippedText)) {
      return {
        roundTrippedText,
        safe: true,
      };
    }

    return {
      diagnostics: createMarkdownSafetyDiagnostics(
        stripSingleTrailingLineEnding(markdown),
        stripSingleTrailingLineEnding(roundTrippedText),
      ),
      reason: "content-changed",
      roundTrippedText,
      safe: false,
    };
  } catch {
    return {
      reason: "conversion-error",
      safe: false,
    };
  }
};
