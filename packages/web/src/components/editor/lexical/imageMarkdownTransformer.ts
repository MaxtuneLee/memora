import {
  $createParagraphNode,
  $createTextNode,
  type ElementNode,
  type LexicalNode,
  type TextNode,
} from "lexical";
import { $createHeadingNode, type HeadingTagType } from "@lexical/rich-text";
import {
  $createTableNodeWithDimensions,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  type TableCellNode,
  type TableNode,
} from "@lexical/table";
import {
  type ElementTransformer,
  type MultilineElementTransformer,
  type TextMatchTransformer,
} from "@lexical/markdown";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode";

import { $createImageNode, $isImageNode, ImageNode } from "@/components/editor/lexical/ImageNode";
import {
  $createMarkdownLinkNode,
  $isMarkdownLinkNode,
  MarkdownLinkNode,
} from "@/components/editor/lexical/MarkdownLinkNode";
import {
  $createMathNode,
  $isMathNode,
  MathNode,
  getMathNodeSourceText,
  type InlineMathDelimiter,
} from "@/components/editor/lexical/MathNode";

const IMAGE_MARKDOWN_REGEXP =
  /!\[([^\]\\]*(?:\\.[^\]\\]*)*)\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/;
const LINK_MARKDOWN_REGEXP =
  /(?<!!)\[([^\]\\]*(?:\\.[^\]\\]*)*)\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?\s*\)/;
const LINKED_IMAGE_MARKDOWN_REGEXP =
  /\[!\[([^\]\\]*(?:\\.[^\]\\]*)*)\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/;
const IMAGE_IMPORT_REGEXP = new RegExp(IMAGE_MARKDOWN_REGEXP.source);
const IMAGE_SHORTCUT_REGEXP = new RegExp(`${IMAGE_MARKDOWN_REGEXP.source}$`);
const LINK_IMPORT_REGEXP = new RegExp(LINK_MARKDOWN_REGEXP.source);
const LINK_SHORTCUT_REGEXP = new RegExp(`${LINK_MARKDOWN_REGEXP.source}$`);
const LINKED_IMAGE_IMPORT_REGEXP = new RegExp(LINKED_IMAGE_MARKDOWN_REGEXP.source);
const LINKED_IMAGE_SHORTCUT_REGEXP = new RegExp(`${LINKED_IMAGE_MARKDOWN_REGEXP.source}$`);
const HTML_ANCHOR_REGEXP =
  /<a\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))[^>]*>(.*?)<\/a>/i;
const HTML_ANCHOR_SHORTCUT_REGEXP = new RegExp(`${HTML_ANCHOR_REGEXP.source}$`, "i");
const HTML_IMAGE_REGEXP = /<img\b[^>]*>/i;
const HTML_IMAGE_SHORTCUT_REGEXP = new RegExp(`${HTML_IMAGE_REGEXP.source}$`, "i");
const DOUBLE_DOLLAR_INLINE_MATH_REGEXP = /\$\$([^\n$]+(?:\$[^\n$]+)*)\$\$/;
const SINGLE_DOLLAR_INLINE_MATH_REGEXP = /(?<!\\)(?<!\$)\$([^\n$]+?)\$(?!\$)/;
const INLINE_MATH_REGEXP = new RegExp(
  `${DOUBLE_DOLLAR_INLINE_MATH_REGEXP.source}|${SINGLE_DOLLAR_INLINE_MATH_REGEXP.source}`,
);
const INLINE_MATH_SHORTCUT_REGEXP = new RegExp(`${INLINE_MATH_REGEXP.source}$`);
const MATH_BLOCK_REGEXP = /^\s{0,3}\$\$([\s\S]+?)\$\$\s*$/;
const MULTILINE_MATH_BLOCK_FENCE_REGEXP = /^\s{0,3}\$\$\s*$/;
const TABLE_ROW_REGEXP = /^\s{0,3}\S.*\|.*$/;
const SETEXT_HEADING_REGEXP = /^\s{0,3}\S.*$/;
const SETEXT_HEADING_MARKER_REGEXP = /^\s{0,3}(=+|-{3,})\s*$/;
const THEMATIC_BREAK_REGEXP = /^\s{0,3}((?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;

interface ParsedMarkdownImage {
  altText: string;
  src: string;
}

interface ParsedMarkdownLink {
  href: string;
  text: string;
  title?: string;
}

interface ParsedMarkdownLinkedImage extends ParsedMarkdownImage {
  href: string;
}

interface ParsedHtmlAnchor {
  href: string;
  text: string;
}

interface ParsedHtmlImage {
  altText: string;
  src: string;
}

interface ParsedMath {
  formula: string;
}

interface ParsedInlineMath extends ParsedMath {
  delimiter: InlineMathDelimiter;
}

const escapeMarkdownText = (text: string): string => {
  return text.replace(/([\\[\]])/g, "\\$1");
};

const escapeMarkdownTitle = (text: string): string => {
  return text.replace(/([\\"])/g, "\\$1");
};

const escapeTableCell = (text: string): string => {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
};

const unescapeMarkdownText = (text: string): string => {
  return text.replace(/\\([\\[\]])/g, "$1");
};

const unescapeMarkdownTitle = (text: string): string => {
  return text.replace(/\\([\\"])/g, "$1");
};

const trimMarkdownLinkDestination = (destination: string): string => {
  return destination.trim().replace(/^<(.+)>$/, "$1");
};

const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
};

const parseHtmlAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const attributeRegExp = /([:\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;
  let match = attributeRegExp.exec(tag);

  while (match) {
    const name = match[1]?.toLowerCase();
    const rawValue = match[2] ?? "";
    if (name) {
      attributes[name] = decodeHtmlEntities(rawValue.replace(/^["']|["']$/g, ""));
    }
    match = attributeRegExp.exec(tag);
  }

  return attributes;
};

export const parseMarkdownImage = (markdown: string): ParsedMarkdownImage | null => {
  const match = markdown.match(IMAGE_MARKDOWN_REGEXP);
  if (!match) {
    return null;
  }

  return {
    altText: unescapeMarkdownText(match[1] ?? ""),
    src: trimMarkdownLinkDestination(match[2] ?? ""),
  };
};

export const parseMarkdownLink = (markdown: string): ParsedMarkdownLink | null => {
  const match = markdown.match(LINK_MARKDOWN_REGEXP);
  if (!match) {
    return null;
  }

  return {
    href: trimMarkdownLinkDestination(match[2] ?? ""),
    text: unescapeMarkdownText(match[1] ?? ""),
    ...((match[3] ?? match[4] ?? match[5])
      ? { title: unescapeMarkdownTitle(match[3] ?? match[4] ?? match[5] ?? "") }
      : {}),
  };
};

export const parseMarkdownLinkedImage = (markdown: string): ParsedMarkdownLinkedImage | null => {
  const match = markdown.match(LINKED_IMAGE_MARKDOWN_REGEXP);
  if (!match) {
    return null;
  }

  return {
    altText: unescapeMarkdownText(match[1] ?? ""),
    href: trimMarkdownLinkDestination(match[3] ?? ""),
    src: trimMarkdownLinkDestination(match[2] ?? ""),
  };
};

export const parseHtmlAnchor = (html: string): ParsedHtmlAnchor | null => {
  const match = html.match(HTML_ANCHOR_REGEXP);
  if (!match) {
    return null;
  }

  const href = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "").trim();
  const text = decodeHtmlEntities((match[4] ?? "").replace(/<[^>]*>/g, "")).trim();
  if (!href || !text) {
    return null;
  }

  return {
    href,
    text,
  };
};

export const parseHtmlImage = (html: string): ParsedHtmlImage | null => {
  const match = html.match(HTML_IMAGE_REGEXP);
  if (!match) {
    return null;
  }

  const attributes = parseHtmlAttributes(match[0]);
  const src = attributes.src?.trim() ?? "";
  if (!src) {
    return null;
  }

  return {
    altText: attributes.alt ?? "",
    src,
  };
};

export const parseInlineMath = (text: string): ParsedInlineMath | null => {
  const doubleDollarMatch = text.match(DOUBLE_DOLLAR_INLINE_MATH_REGEXP);
  const singleDollarMatch = text.match(SINGLE_DOLLAR_INLINE_MATH_REGEXP);
  const match =
    doubleDollarMatch && singleDollarMatch
      ? (doubleDollarMatch.index ?? 0) <= (singleDollarMatch.index ?? 0)
        ? doubleDollarMatch
        : singleDollarMatch
      : (doubleDollarMatch ?? singleDollarMatch);
  const formula = match?.[1]?.trim() ?? "";
  if (!formula) {
    return null;
  }

  return {
    delimiter: match === singleDollarMatch ? "$" : "$$",
    formula,
  };
};

export const parseMathBlock = (text: string): ParsedMath | null => {
  const match = text.match(MATH_BLOCK_REGEXP);
  const formula = match?.[1]?.trim() ?? "";
  return formula ? { formula } : null;
};

const hasUnescapedPipe = (line: string): boolean => {
  let escaped = false;
  for (const character of line) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "|") {
      return true;
    }
  }

  return false;
};

const splitTableCells = (line: string): string[] => {
  const cells: string[] = [];
  let currentCell = "";
  let escaped = false;
  const trimmedLine = line.trim();
  const content = trimmedLine.replace(/^\|/, "").replace(/\|$/, "");

  for (const character of content) {
    if (escaped) {
      currentCell += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "|") {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell.trim());
  return cells;
};

const isTableDividerCell = (cell: string): boolean => {
  return /^:?-{3,}:?$/.test(cell.trim());
};

const isTableRowLine = (line: string): boolean => {
  return TABLE_ROW_REGEXP.test(line) && hasUnescapedPipe(line);
};

const isTableDividerLine = (line: string): boolean => {
  return isTableRowLine(line) && splitTableCells(line).every(isTableDividerCell);
};

export const parseMarkdownTableLines = (lines: readonly string[]): string[][] | null => {
  if (lines.length < 2) {
    return null;
  }

  const [headerLine, dividerLine, ...bodyLines] = lines;
  if (
    !headerLine ||
    !dividerLine ||
    !isTableRowLine(headerLine) ||
    !isTableDividerLine(dividerLine)
  ) {
    return null;
  }

  const parsedRows = [headerLine, ...bodyLines.filter(isTableRowLine)].map(splitTableCells);
  const headerColumnCount = parsedRows[0]?.length ?? 0;
  const dividerColumnCount = splitTableCells(dividerLine).length;
  if (headerColumnCount === 0 || headerColumnCount !== dividerColumnCount) {
    return null;
  }

  return parsedRows;
};

export const getSetextHeadingTag = (
  textLine: string,
  markerLine: string,
): HeadingTagType | null => {
  if (!textLine.trim()) {
    return null;
  }

  const match = markerLine.match(SETEXT_HEADING_MARKER_REGEXP);
  if (!match) {
    return null;
  }

  return match[1]?.startsWith("=") ? "h1" : "h2";
};

const getCellText = (cellNode: TableCellNode): string => {
  return cellNode.getTextContent().trim();
};

const createParagraphWithText = (text: string): ElementNode => {
  const paragraph = $createParagraphNode();
  paragraph.append($createTextNode(text));
  return paragraph;
};

const fillTableNode = (tableNode: TableNode, rows: readonly string[][]): void => {
  const rowNodes = tableNode.getChildren();

  rowNodes.forEach((rowNode, rowIndex) => {
    if (!$isTableRowNode(rowNode)) {
      return;
    }

    const cellValues = rows[rowIndex] ?? [];
    rowNode.getChildren().forEach((cellNode, columnIndex) => {
      if (!$isTableCellNode(cellNode)) {
        return;
      }

      cellNode.clear();
      cellNode.append(createParagraphWithText(cellValues[columnIndex] ?? ""));
    });
  });
};

const exportTable = (tableNode: TableNode): string => {
  const rows = tableNode
    .getChildren()
    .filter($isTableRowNode)
    .map((rowNode) => {
      return rowNode
        .getChildren()
        .filter($isTableCellNode)
        .map((cellNode) => escapeTableCell(getCellText(cellNode)));
    });

  if (rows.length === 0) {
    return "";
  }

  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const normalizedRows = rows.map((row) => {
    return Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
  });
  const [headerRow, ...bodyRows] = normalizedRows;
  const header = `| ${headerRow.join(" | ")} |`;
  const divider = `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`;
  const body = bodyRows.map((row) => `| ${row.join(" | ")} |`);

  return [header, divider, ...body].join("\n");
};

export const IMAGE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node: LexicalNode) => {
    if (!$isImageNode(node)) {
      return null;
    }

    const href = node.getHref();
    if (href) {
      return `[![${escapeMarkdownText(node.getAltText())}](${node.getSrc()})](${href})`;
    }

    return `![${escapeMarkdownText(node.getAltText())}](${node.getSrc()})`;
  },
  importRegExp: IMAGE_IMPORT_REGEXP,
  regExp: IMAGE_SHORTCUT_REGEXP,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const image = parseMarkdownImage(match[0]);
    if (!image) {
      return;
    }

    textNode.replace($createImageNode(image.src, image.altText));
  },
  trigger: ")",
  type: "text-match",
};

export const LINKED_IMAGE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [ImageNode],
  importRegExp: LINKED_IMAGE_IMPORT_REGEXP,
  regExp: LINKED_IMAGE_SHORTCUT_REGEXP,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const image = parseMarkdownLinkedImage(match[0]);
    if (!image) {
      return;
    }

    textNode.replace($createImageNode(image.src, image.altText, image.href));
  },
  trigger: ")",
  type: "text-match",
};

export const MARKDOWN_LINK_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MarkdownLinkNode],
  export: (node: LexicalNode) => {
    if (!$isMarkdownLinkNode(node)) {
      return null;
    }

    const title = node.getTitle();
    return `[${escapeMarkdownText(node.getTextContent())}](${node.getURL()}${
      title ? ` "${escapeMarkdownTitle(title)}"` : ""
    })`;
  },
  importRegExp: LINK_IMPORT_REGEXP,
  regExp: LINK_SHORTCUT_REGEXP,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const link = parseMarkdownLink(match[0]);
    if (!link) {
      return;
    }

    const linkNode = $createMarkdownLinkNode(link.href, {
      title: link.title ?? null,
    });
    const linkTextNode = $createTextNode(link.text);
    linkTextNode.setFormat(textNode.getFormat());
    linkNode.append(linkTextNode);
    textNode.replace(linkNode);
  },
  trigger: ")",
  type: "text-match",
};

export const HTML_ANCHOR_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MarkdownLinkNode],
  importRegExp: HTML_ANCHOR_REGEXP,
  regExp: HTML_ANCHOR_SHORTCUT_REGEXP,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const anchor = parseHtmlAnchor(match[0]);
    if (!anchor) {
      return;
    }

    const linkNode = $createMarkdownLinkNode(anchor.href);
    const linkTextNode = $createTextNode(anchor.text);
    linkTextNode.setFormat(textNode.getFormat());
    linkNode.append(linkTextNode);
    textNode.replace(linkNode);
  },
  trigger: ">",
  type: "text-match",
};

export const HTML_IMAGE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [ImageNode],
  importRegExp: HTML_IMAGE_REGEXP,
  regExp: HTML_IMAGE_SHORTCUT_REGEXP,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const image = parseHtmlImage(match[0]);
    if (!image) {
      return;
    }

    textNode.replace($createImageNode(image.src, image.altText));
  },
  trigger: ">",
  type: "text-match",
};

export const INLINE_MATH_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MathNode],
  export: (node: LexicalNode) => {
    if (!$isMathNode(node) || node.getDisplayMode()) {
      return null;
    }

    return getMathNodeSourceText(node.getFormula(), node.getInlineDelimiter());
  },
  importRegExp: INLINE_MATH_REGEXP,
  regExp: INLINE_MATH_SHORTCUT_REGEXP,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const math = parseInlineMath(match[0]);
    if (!math) {
      return;
    }

    textNode.replace($createMathNode(math.formula, false, false, math.delimiter));
  },
  trigger: "$",
  type: "text-match",
};

export const MATH_BLOCK_TRANSFORMER: ElementTransformer = {
  dependencies: [MathNode],
  export: (node: LexicalNode) => {
    if (!$isMathNode(node) || !node.getDisplayMode() || node.getFormula().includes("\n")) {
      return null;
    }

    return getMathNodeSourceText(node.getFormula());
  },
  regExp: MATH_BLOCK_REGEXP,
  replace: (parentNode: ElementNode, _children, match, isImport) => {
    const math = parseMathBlock(match[0] ?? "");
    if (!math) {
      return false;
    }

    const mathNode = $createMathNode(math.formula, true);
    parentNode.replace(mathNode);
    if (!isImport) {
      mathNode.selectNext();
    }
  },
  type: "element",
};

export const MULTILINE_MATH_BLOCK_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [MathNode],
  export: (node: LexicalNode) => {
    if (
      !$isMathNode(node) ||
      !node.getDisplayMode() ||
      (!node.usesMultilineMarkdown() && !node.getFormula().includes("\n"))
    ) {
      return null;
    }

    return `$$\n${node.getFormula()}\n$$`;
  },
  regExpEnd: MULTILINE_MATH_BLOCK_FENCE_REGEXP,
  regExpStart: MULTILINE_MATH_BLOCK_FENCE_REGEXP,
  replace: (rootNode, _children, _startMatch, _endMatch, linesInBetween) => {
    const formulaLines = linesInBetween ?? [];
    const contentStart = formulaLines[0]?.trim() === "" ? 1 : 0;
    const contentEnd = formulaLines.at(-1)?.trim() === "" ? formulaLines.length - 1 : undefined;
    const formula = formulaLines.slice(contentStart, contentEnd).join("\n");
    if (!formula.trim()) {
      return false;
    }

    rootNode.append($createMathNode(formula, true, true));
  },
  type: "multiline-element",
};

export const HORIZONTAL_RULE_TRANSFORMER: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => {
    return $isHorizontalRuleNode(node) ? "---" : null;
  },
  regExp: THEMATIC_BREAK_REGEXP,
  replace: (parentNode: ElementNode, _children, _match, isImport) => {
    const horizontalRuleNode = $createHorizontalRuleNode();
    if (isImport || parentNode.getNextSibling() !== null) {
      parentNode.replace(horizontalRuleNode);
    } else {
      parentNode.insertBefore(horizontalRuleNode);
    }
    horizontalRuleNode.selectNext();
  },
  type: "element",
};

export const SETEXT_HEADING_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [],
  export: () => null,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    if (startLineIndex + 1 >= lines.length) {
      return null;
    }

    const textLine = lines[startLineIndex] ?? "";
    const markerLine = lines[startLineIndex + 1] ?? "";
    const headingTag = getSetextHeadingTag(textLine, markerLine);
    if (!headingTag) {
      return null;
    }

    const headingNode = $createHeadingNode(headingTag);
    headingNode.append($createTextNode(textLine.trim()));
    rootNode.append(headingNode);
    return [true, startLineIndex + 1];
  },
  regExpStart: SETEXT_HEADING_REGEXP,
  replace: () => false,
  type: "multiline-element",
};

export const TABLE_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [],
  export: (node: LexicalNode) => {
    if (!$isTableNode(node)) {
      return null;
    }

    return exportTable(node);
  },
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    if (startLineIndex + 1 >= lines.length) {
      return null;
    }

    const tableLines = [lines[startLineIndex] ?? "", lines[startLineIndex + 1] ?? ""];
    const parsedHeader = parseMarkdownTableLines(tableLines);
    if (!parsedHeader) {
      return null;
    }

    const rowLines = [...tableLines];
    let cursor = startLineIndex + 2;
    while (cursor < lines.length && isTableRowLine(lines[cursor] ?? "")) {
      rowLines.push(lines[cursor]!);
      cursor += 1;
    }

    const parsedRows = parseMarkdownTableLines(rowLines);
    if (!parsedRows) {
      return null;
    }

    const columnCount = Math.max(...parsedRows.map((row) => row.length), 1);
    const tableNode = $createTableNodeWithDimensions(parsedRows.length, columnCount, true);
    fillTableNode(tableNode, parsedRows);
    rootNode.append(tableNode);
    return [true, cursor - 1];
  },
  regExpEnd: {
    optional: true,
    regExp: TABLE_ROW_REGEXP,
  },
  regExpStart: TABLE_ROW_REGEXP,
  replace: (rootNode, _children, startMatch, _endMatch, linesInBetween, isImport) => {
    if (!isImport) {
      return false;
    }

    const headerLine = startMatch[0] ?? "";
    const bodyLines = linesInBetween?.filter(isTableRowLine) ?? [];
    if (bodyLines.length === 0) {
      return false;
    }

    const parsedRows = parseMarkdownTableLines([headerLine, ...bodyLines]);
    if (!parsedRows) {
      return false;
    }

    const columnCount = Math.max(...parsedRows.map((row) => row.length), 1);
    const tableNode = $createTableNodeWithDimensions(parsedRows.length, columnCount, true);
    fillTableNode(tableNode, parsedRows);
    rootNode.append(tableNode);
  },
  type: "multiline-element",
};
