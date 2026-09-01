import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as mammoth from "mammoth";
import { PptxHandler, PptxMarkdownConverter, type PptxElement } from "pptx-viewer-core";

export type ParsedDocumentKind = "pdf" | "docx" | "pptx";

export type DocumentParseStage = "reading" | "extracting" | "rendering" | "ocr" | "converting";

export interface DocumentParseProgress {
  stage: DocumentParseStage;
  label: string;
  current?: number;
  total?: number;
}

export interface PdfTextItem {
  text: string;
  hasLineBreak: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfJsTextItem {
  str: string;
  hasEOL: boolean;
  transform: Array<unknown>;
  width: number;
  height: number;
}

export interface OcrFallbackResult {
  markdown: string;
  blockCount: number;
  warnings: string[];
  elapsedMs: number;
}

export interface ParsedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  source: "text" | "ocr";
  text: string;
  textItems: PdfTextItem[];
  ocr?: OcrFallbackResult;
}

export interface ParsedPdfDocument {
  kind: "pdf";
  fileName: string;
  fileSize: number;
  pages: ParsedPdfPage[];
  text: string;
  warnings: string[];
  elapsedMs: number;
}

export interface ParsedDocxDocument {
  kind: "docx";
  fileName: string;
  fileSize: number;
  html: string;
  text: string;
  docxPreviewParser: DocxPreviewParserSummary;
  warnings: string[];
  elapsedMs: number;
}

export interface DocxPreviewParserSummary {
  api: "docx-preview.parseAsync";
  status: "available" | "unavailable";
  elapsedMs: number;
  topLevelKeys: string[];
  partCount: number;
  bodyNodeCount: number;
  mathExpressionCount: number;
  nodeTypes: Array<{ type: string; count: number }>;
  content: DocxPreviewContentNode[];
  contentTruncated: boolean;
  markdown: string;
  markdownWarnings: string[];
  error?: string;
}

export interface DocxPreviewContentNode {
  type: string;
  text?: string;
  children?: DocxPreviewContentNode[];
}

export interface ParsedPptxSlide {
  slideNumber: number;
  text: string;
  notes: string[];
  comments: string[];
  imageAttachmentNames: string[];
}

export interface ParsedPptxImage {
  name: string;
  mimeType: string;
  altText?: string;
  file: File;
  ocr?: OcrFallbackResult;
}

export interface ParsedPptxDocument {
  kind: "pptx";
  fileName: string;
  fileSize: number;
  viewerContent: Uint8Array;
  title?: string;
  author?: string;
  slides: ParsedPptxSlide[];
  images: ParsedPptxImage[];
  markdown: string;
  text: string;
  warnings: string[];
  elapsedMs: number;
}

export type ParsedDocument = ParsedPdfDocument | ParsedDocxDocument | ParsedPptxDocument;

export interface DocumentParserOptions {
  onProgress?: (progress: DocumentParseProgress) => void;
  runOcrPage?: (file: File, pageNumber: number) => Promise<OcrFallbackResult>;
}

const PDF_TEXT_MINIMUM_CHARACTERS = 100;
const MAX_DOCX_PREVIEW_NODES = 20_000;
const MAX_DOCX_PREVIEW_CONTENT_NODES = 10_000;
const MAX_PPTX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_PPTX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const DROP_WITH_CONTENT_TAGS = new Set([
  "audio",
  "base",
  "button",
  "embed",
  "form",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "video",
]);
const ALLOWED_DOCUMENT_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const isTextItem = (item: unknown): item is PdfJsTextItem =>
  typeof item === "object" &&
  item !== null &&
  "str" in item &&
  "hasEOL" in item &&
  "transform" in item &&
  "width" in item &&
  "height" in item;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const toTextItems = (items: PdfJsTextItem[]): PdfTextItem[] =>
  items.map((item) => ({
    text: item.str,
    hasLineBreak: item.hasEOL,
    x: Number(item.transform[4]) || 0,
    y: Number(item.transform[5]) || 0,
    width: item.width,
    height: item.height,
  }));

export const joinPdfTextItems = (
  items: Array<Pick<PdfTextItem, "text" | "hasLineBreak">>,
): string => {
  let text = "";
  for (const item of items) {
    const value = item.text.trim();
    if (value) text += value;
    text += item.hasLineBreak ? "\n" : " ";
  }
  return text
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/[\t ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const shouldRunPdfOcrFallback = (text: string): boolean =>
  text.replace(/\s/g, "").length < PDF_TEXT_MINIMUM_CHARACTERS;

const canvasToPngFile = async (canvas: HTMLCanvasElement, pageNumber: number): Promise<File> => {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("PDF page could not be rendered."))),
      "image/png",
    );
  });
  return new File([blob], `pdf-page-${pageNumber}.png`, { type: "image/png" });
};

const renderPdfPageForOcr = async (page: pdfjs.PDFPageProxy, pageNumber: number): Promise<File> => {
  const viewport = page.getViewport({ scale: 1.7 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  return canvasToPngFile(canvas, pageNumber);
};

const isSafeHref = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("#") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("mailto:")
  );
};

const isSafeImageSource = (value: string): boolean =>
  /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(value.trim());

export const sanitizeDocxHtml = (source: string): string => {
  const document = new DOMParser().parseFromString(source, "text/html");
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    const tagName = element.tagName.toLowerCase();
    if (!ALLOWED_DOCUMENT_TAGS.has(tagName)) {
      if (DROP_WITH_CONTENT_TAGS.has(tagName)) element.remove();
      else element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase();
      const isAllowedAttribute =
        (tagName === "a" && attributeName === "href" && isSafeHref(attribute.value)) ||
        (tagName === "img" && attributeName === "src" && isSafeImageSource(attribute.value)) ||
        (tagName === "img" && attributeName === "alt") ||
        (tagName === "td" && (attributeName === "colspan" || attributeName === "rowspan")) ||
        (tagName === "th" && (attributeName === "colspan" || attributeName === "rowspan")) ||
        (tagName === "ol" && attributeName === "start");
      if (!isAllowedAttribute) element.removeAttribute(attribute.name);
    }
    if (tagName === "a") {
      element.setAttribute("rel", "noreferrer noopener");
      element.setAttribute("target", "_blank");
    }
  }
  return document.body.innerHTML;
};

const htmlToPlainText = (html: string): string =>
  new DOMParser()
    .parseFromString(html, "text/html")
    .body.textContent?.replace(/\n{3,}/g, "\n\n")
    .trim() ?? "";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getNodeChildren = (value: unknown): unknown[] => {
  const record = asRecord(value);
  return Array.isArray(record?.children) ? record.children : [];
};

const getNodeType = (value: unknown): string => {
  const record = asRecord(value);
  return typeof record?.type === "string" ? record.type : "unknown";
};

const getStringValue = (value: unknown, key: string): string | undefined => {
  const record = asRecord(value);
  return typeof record?.[key] === "string" ? record[key] : undefined;
};

const getArrayValue = (value: unknown, key: string): unknown[] => {
  const record = asRecord(value);
  return Array.isArray(record?.[key]) ? record[key] : [];
};

const escapeMarkdownText = (value: string): string => value.replace(/([\\`*_[\]<>])/g, "\\$1");

const normalizeMarkdown = (value: string): string =>
  value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const getNestedNode = (nodes: unknown[], type: string): unknown =>
  nodes.find((node) => getNodeType(node) === type);

const toMathLatex = (node: unknown): string => {
  const type = getNodeType(node);
  const children = getNodeChildren(node);
  const props = asRecord(asRecord(node)?.props);
  const renderChildren = (): string => children.map(toMathLatex).join("");
  const renderArgument = (argumentType: string): string =>
    toMathLatex(getNestedNode(children, argumentType));

  if (type === "text") return getStringValue(node, "text") ?? "";
  if (type === "mmlRun" || type === "run") return renderChildren();
  if (type === "mmlFraction") {
    return `\\frac{${renderArgument("mmlNumerator")}}{${renderArgument("mmlDenominator")}}`;
  }
  if (type === "mmlRadical") {
    const degree = renderArgument("mmlDegree");
    const base = renderArgument("mmlBase");
    return degree ? `\\sqrt[${degree}]{${base}}` : `\\sqrt{${base}}`;
  }
  if (type === "mmlSuperscript") {
    return `${renderArgument("mmlBase")}^{${renderArgument("mmlSuperArgument")}}`;
  }
  if (type === "mmlSubscript") {
    return `${renderArgument("mmlBase")}_{${renderArgument("mmlSubArgument")}}`;
  }
  if (type === "mmlPreSubSuper") {
    return `{}_{${renderArgument("mmlSubArgument")}}^{${renderArgument("mmlSuperArgument")}}${renderArgument("mmlBase")}`;
  }
  if (type === "mmlNary") {
    const operator = typeof props?.char === "string" ? props.char : "∑";
    return `${operator}${renderChildren()}`;
  }
  if (type === "mmlDelimiter") {
    const begin = typeof props?.beginChar === "string" ? props.beginChar : "";
    const end = typeof props?.endChar === "string" ? props.endChar : "";
    return `${begin}${renderChildren()}${end}`;
  }
  return renderChildren();
};

const getHeadingLevel = (styleName: string | undefined): number | null => {
  if (!styleName) return null;
  const normalized = styleName.toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized.includes("title")) return 1;
  const match = normalized.match(/heading(?:char)?([1-6])/);
  return match ? Number(match[1]) : null;
};

const getExplicitHeadingLevel = (node: unknown): number | null => {
  const record = asRecord(node);
  const styleHeadingLevel = getHeadingLevel(getStringValue(node, "styleName"));
  if (styleHeadingLevel) return styleHeadingLevel;
  const outlineLevel = record?.outlineLevel;
  return typeof outlineLevel === "number" && outlineLevel >= 0 && outlineLevel <= 5
    ? outlineLevel + 1
    : null;
};

const stripInlineMarkdown = (value: string): string =>
  normalizeMarkdown(
    value
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/([\^~])\(([^)]+)\)/g, "$2"),
  );

const formatNumberedHeading = (value: string): string | null => {
  const match = value.match(/^(\d+)\.\s+(.+)$/);
  if (!match) return null;
  const title = match[2]
    .replace(/\s*\([^)]{0,160}\)\s*:?[\s]*$/, "")
    .replace(/:\s*$/, "")
    .trim();
  return title ? `## ${match[1]}. ${title}` : null;
};

const looksLikeTitleCase = (value: string): boolean => {
  const words = value.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
  if (!words.length || words.length > 14 || value.length > 110 || /[.!?;]$/.test(value)) {
    return false;
  }
  const significantWords = words.filter(
    (word) =>
      !["and", "or", "for", "to", "of", "in", "the", "a", "an"].includes(word.toLowerCase()),
  );
  if (!significantWords.length) return false;
  const titleCaseWords = significantWords.filter(
    (word) => /^[A-Z]/.test(word) || word === word.toUpperCase(),
  );
  return titleCaseWords.length / significantWords.length >= 0.7;
};

interface DocxNumberingInfo {
  id: string;
  level: number;
  format: string;
  starts: number[];
}

const getNumberValue = (value: unknown, fallback: number): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getDocxNumberingInfo = (
  paragraph: Record<string, unknown>,
  document: Record<string, unknown>,
): DocxNumberingInfo | null => {
  const numbering = asRecord(paragraph.numbering);
  if (!numbering || typeof numbering.id !== "string") return null;
  const level = getNumberValue(numbering.level, 0);
  const numberingPart = asRecord(document.numberingPart);
  const currentNumbering = getArrayValue(numberingPart, "numberings").find(
    (candidate) => asRecord(candidate)?.id === numbering.id,
  );
  const abstractId = asRecord(currentNumbering)?.abstractId;
  const abstractNumbering = getArrayValue(numberingPart, "abstractNumberings").find(
    (candidate) => asRecord(candidate)?.id === abstractId,
  );
  const levels = getArrayValue(abstractNumbering, "levels");
  const currentLevel = asRecord(
    levels.find((candidate) => getNumberValue(asRecord(candidate)?.level, -1) === level),
  );
  const format = getStringValue(currentLevel, "format");
  if (!format) return null;

  return {
    id: numbering.id,
    level,
    format,
    starts: levels.map((candidate) => getNumberValue(asRecord(candidate)?.start, 1)),
  };
};

const isNumberedDocxHeading = (
  paragraph: Record<string, unknown>,
  document: Record<string, unknown>,
): boolean =>
  paragraph.styleName === "ListParagraph" &&
  getDocxNumberingInfo(paragraph, document)?.format === "decimal";

const getNumberedHeadingLabel = (
  numbering: DocxNumberingInfo,
  counters: Map<string, number[]>,
): string => {
  const values = counters.get(numbering.id) ?? [];
  values.splice(numbering.level + 1);
  values[numbering.level] =
    (values[numbering.level] ?? numbering.starts[numbering.level] ?? 1) +
    (values[numbering.level] === undefined ? 0 : 1);
  for (let index = 0; index < numbering.level; index += 1) {
    values[index] ??= numbering.starts[index] ?? 1;
  }
  counters.set(numbering.id, values);
  return values.slice(0, numbering.level + 1).join(".");
};

const inferDocxHeading = (
  value: string,
  previousValue: string,
  nextValue: string,
): string | null => {
  const plain = stripInlineMarkdown(value);
  if (!plain) return null;
  const numberedHeading = formatNumberedHeading(plain);
  if (numberedHeading) return numberedHeading;
  if (/^[A-Z][A-Z\s]+$/.test(plain) && plain.length >= 12) return `# ${plain}`;
  if (/project case study report/i.test(plain)) return `# ${plain}`;
  if (/^\d+\.\s+project title/i.test(stripInlineMarkdown(previousValue))) return `# ${plain}`;
  if (looksLikeTitleCase(plain) && nextValue.length >= 160) return `### ${plain}`;
  return null;
};

const getRawNodeText = (node: unknown): string => {
  const type = getNodeType(node);
  if (type === "text") return getStringValue(node, "text") ?? "";
  if (type === "break") return "\n";
  if (type === "tab") return "\t";
  if (type === "mmlMath" || type === "mmlMathParagraph") return toMathLatex(node);
  return getNodeChildren(node).map(getRawNodeText).join("");
};

const getListPrefix = (
  paragraph: Record<string, unknown>,
  document: Record<string, unknown>,
): string | null => {
  const numbering = getDocxNumberingInfo(paragraph, document);
  if (!numbering) return null;
  const marker = numbering.format === "bullet" ? "- " : "1. ";
  return `${"  ".repeat(Math.max(0, numbering.level))}${marker}`;
};

const toInlineMarkdown = (
  node: unknown,
  document: Record<string, unknown>,
  warnings: Set<string>,
): string => {
  const record = asRecord(node);
  const type = getNodeType(node);
  const children = getNodeChildren(node);
  const content = (): string =>
    children.map((child) => toInlineMarkdown(child, document, warnings)).join("");

  if (type === "text") return escapeMarkdownText(getStringValue(node, "text") ?? "");
  if (type === "break") return "\n";
  if (type === "tab") return "\t";
  if (type === "noBreakHyphen") return "-";
  if (type === "symbol")
    return typeof record?.char === "number" ? String.fromCodePoint(record.char) : "";
  if (type === "mmlMath") return `$${toMathLatex(node)}$`;
  if (type === "mmlMathParagraph") return `\n\n$$\n${toMathLatex(node)}\n$$\n\n`;
  if (type === "hyperlink") {
    const relationshipId = getStringValue(node, "id");
    const relationships = getArrayValue(document.documentPart, "rels");
    const relationship = relationships.find(
      (candidate) => asRecord(candidate)?.id === relationshipId,
    );
    const href = getStringValue(relationship, "target") ?? getStringValue(node, "anchor");
    const label = content();
    return href ? `[${label}](${href})` : label;
  }
  if (type === "run" || type === "mmlRun") {
    let result = content();
    const style = asRecord(record?.cssStyle);
    if (record?.verticalAlign === "superscript") result = `^(${result})`;
    if (record?.verticalAlign === "subscript") result = `~(${result})`;
    if (style?.["text-decoration"] === "line-through") result = `~~${result}~~`;
    if (style?.["font-style"] === "italic") result = `*${result}*`;
    if (style?.["font-weight"] === "bold" || style?.["font-weight"] === "700")
      result = `**${result}**`;
    return result;
  }
  if (type === "drawing" || type === "image" || type === "vmlPicture") {
    warnings.add(`Unsupported ${type} content was omitted from Markdown.`);
    return "";
  }
  return content();
};

const toTableMarkdown = (
  table: unknown,
  document: Record<string, unknown>,
  warnings: Set<string>,
): string => {
  const rows = getNodeChildren(table).filter((node) => getNodeType(node) === "row");
  const cellRows = rows.map((row) =>
    getNodeChildren(row)
      .filter((node) => getNodeType(node) === "cell")
      .map((cell) =>
        normalizeMarkdown(
          getNodeChildren(cell)
            .map((child) => toBlockMarkdown(child, document, warnings))
            .join(" "),
        )
          .replace(/\|/g, "\\|")
          .replace(/\n/g, "<br>"),
      ),
  );
  if (!cellRows.length) return "";
  const columnCount = Math.max(...cellRows.map((row) => row.length));
  const normalizeRow = (row: string[]): string[] =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
  const [header, ...body] = cellRows.map(normalizeRow);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];
  return lines.join("\n");
};

const toBlockMarkdown = (
  node: unknown,
  document: Record<string, unknown>,
  warnings: Set<string>,
): string => {
  const record = asRecord(node);
  const type = getNodeType(node);
  if (type === "table") return toTableMarkdown(node, document, warnings);
  if (type !== "paragraph") return toInlineMarkdown(node, document, warnings);

  const content = normalizeMarkdown(
    getNodeChildren(node)
      .map((child) => toInlineMarkdown(child, document, warnings))
      .join(""),
  );
  if (!content) return "";
  const headingLevel = getExplicitHeadingLevel(node);
  if (headingLevel) return `${"#".repeat(headingLevel)} ${stripInlineMarkdown(content)}`;
  if (record && isNumberedDocxHeading(record, document)) return content;
  const prefix = record ? getListPrefix(record, document) : null;
  return prefix ? `${prefix}${content}` : content;
};

export const convertDocxPreviewToMarkdown = (
  document: unknown,
): {
  markdown: string;
  warnings: string[];
} => {
  const root = asRecord(document);
  const body = asRecord(root?.documentPart)?.body;
  if (!root || !body) {
    return { markdown: "", warnings: ["docx-preview did not return a document body."] };
  }
  const warnings = new Set<string>();
  const blocks = getNodeChildren(body).map((node) => ({
    node,
    markdown: toBlockMarkdown(node, root, warnings),
    rawText: normalizeMarkdown(getRawNodeText(node)),
  }));
  const markdownBlocks: string[] = [];
  let previousValue = "";
  const headingCounters = new Map<string, number[]>();

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block.markdown) continue;
    const nextValue =
      blocks
        .slice(index + 1)
        .map((candidate) => candidate.rawText)
        .find(Boolean) ?? "";
    const paragraph = asRecord(block.node);
    const numbering = paragraph ? getDocxNumberingInfo(paragraph, root) : null;
    const numberedHeading =
      paragraph && numbering && isNumberedDocxHeading(paragraph, root)
        ? `${"#".repeat(Math.min(6, numbering.level + 2))} ${getNumberedHeadingLabel(numbering, headingCounters)}. ${stripInlineMarkdown(block.markdown)}`
        : null;
    const inferredHeading =
      getNodeType(block.node) === "paragraph"
        ? inferDocxHeading(block.rawText, previousValue, nextValue)
        : null;
    const output = numberedHeading ?? inferredHeading ?? block.markdown;
    markdownBlocks.push(output);
    previousValue = block.rawText;
  }

  const markdown = normalizeMarkdown(markdownBlocks.join("\n\n"));
  return { markdown, warnings: [...warnings] };
};

const projectDocxPreviewContent = (
  nodes: unknown[],
): {
  content: DocxPreviewContentNode[];
  truncated: boolean;
} => {
  let projectedNodeCount = 0;
  let truncated = false;

  const project = (node: unknown): DocxPreviewContentNode | null => {
    if (projectedNodeCount >= MAX_DOCX_PREVIEW_CONTENT_NODES) {
      truncated = true;
      return null;
    }
    const record = asRecord(node);
    if (!record) return null;

    projectedNodeCount += 1;
    const children = getNodeChildren(node)
      .map(project)
      .filter((child): child is DocxPreviewContentNode => child !== null);
    const text = typeof record.text === "string" && record.text ? record.text : undefined;

    return {
      type: typeof record.type === "string" ? record.type : "unknown",
      ...(text ? { text } : {}),
      ...(children.length ? { children } : {}),
    };
  };

  return {
    content: nodes.map(project).filter((node): node is DocxPreviewContentNode => node !== null),
    truncated,
  };
};

export const summarizeDocxPreviewDocument = (document: unknown): DocxPreviewParserSummary => {
  const root = asRecord(document);
  const documentPart = asRecord(root?.documentPart);
  const body = documentPart?.body;
  const nodeTypeCounts = new Map<string, number>();
  let bodyNodeCount = 0;
  let mathExpressionCount = 0;

  const visit = (node: unknown): void => {
    if (bodyNodeCount >= MAX_DOCX_PREVIEW_NODES) return;
    const record = asRecord(node);
    if (!record) return;
    bodyNodeCount += 1;
    const type = typeof record.type === "string" ? record.type : "unknown";
    nodeTypeCounts.set(type, (nodeTypeCounts.get(type) ?? 0) + 1);
    if (type === "mmlMath") mathExpressionCount += 1;
    for (const child of getNodeChildren(node)) visit(child);
  };

  for (const child of getNodeChildren(body)) visit(child);
  const projectedContent = projectDocxPreviewContent(getNodeChildren(body));
  const convertedMarkdown = convertDocxPreviewToMarkdown(document);

  return {
    api: "docx-preview.parseAsync",
    status: "available",
    elapsedMs: 0,
    topLevelKeys: Object.keys(root ?? {})
      .filter((key) => !key.startsWith("_"))
      .sort()
      .slice(0, 20),
    partCount: Array.isArray(root?.parts) ? root.parts.length : 0,
    bodyNodeCount,
    mathExpressionCount,
    nodeTypes: [...nodeTypeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type)),
    content: projectedContent.content,
    contentTruncated: projectedContent.truncated,
    markdown: convertedMarkdown.markdown,
    markdownWarnings: convertedMarkdown.warnings,
  };
};

const inspectDocxPreviewParser = async (file: File): Promise<DocxPreviewParserSummary> => {
  const startedAt = performance.now();
  try {
    const { parseAsync } = await import("docx-preview");
    const document = await parseAsync(file, {
      renderAltChunks: false,
      renderComments: false,
      useBase64URL: true,
    });
    return {
      ...summarizeDocxPreviewDocument(document),
      elapsedMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      api: "docx-preview.parseAsync",
      status: "unavailable",
      elapsedMs: performance.now() - startedAt,
      topLevelKeys: [],
      partCount: 0,
      bodyNodeCount: 0,
      mathExpressionCount: 0,
      nodeTypes: [],
      content: [],
      contentTruncated: false,
      markdown: "",
      markdownWarnings: [],
      error: getErrorMessage(error),
    };
  }
};

const configurePdfWorker = (): void => {
  if (pdfjs.GlobalWorkerOptions.workerSrc !== pdfWorkerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
};

const parsePdf = async (file: File, options: DocumentParserOptions): Promise<ParsedPdfDocument> => {
  const startedAt = performance.now();
  options.onProgress?.({ stage: "reading", label: "Opening PDF" });
  configurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    disableAutoFetch: true,
    useWorkerFetch: false,
  });
  let document: pdfjs.PDFDocumentProxy | null = null;
  try {
    document = await loadingTask.promise;
    const pages: ParsedPdfPage[] = [];
    const warnings: string[] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      options.onProgress?.({
        stage: "extracting",
        label: `Extracting text from page ${index}/${document.numPages}`,
        current: index,
        total: document.numPages,
      });
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const rawTextItems = textContent.items.reduce<PdfJsTextItem[]>((items, item) => {
        if (isTextItem(item)) items.push(item);
        return items;
      }, []);
      const textItems = toTextItems(rawTextItems);
      const text = joinPdfTextItems(textItems);
      if (!shouldRunPdfOcrFallback(text)) {
        pages.push({
          pageNumber: index,
          width: viewport.width,
          height: viewport.height,
          source: "text",
          text,
          textItems,
        });
        continue;
      }

      if (!options.runOcrPage) {
        warnings.push(`Page ${index} has no usable text layer and OCR is unavailable.`);
        pages.push({
          pageNumber: index,
          width: viewport.width,
          height: viewport.height,
          source: "ocr",
          text: "",
          textItems,
        });
        continue;
      }

      options.onProgress?.({
        stage: "rendering",
        label: `Rendering scanned page ${index}/${document.numPages}`,
        current: index,
        total: document.numPages,
      });
      const image = await renderPdfPageForOcr(page, index);
      options.onProgress?.({
        stage: "ocr",
        label: `Running OCR for page ${index}/${document.numPages}`,
        current: index,
        total: document.numPages,
      });
      const ocr = await options.runOcrPage(image, index);
      warnings.push(...ocr.warnings.map((warning) => `Page ${index}: ${warning}`));
      pages.push({
        pageNumber: index,
        width: viewport.width,
        height: viewport.height,
        source: "ocr",
        text: ocr.markdown,
        textItems,
        ocr,
      });
    }

    const ocrCount = pages.filter((page) => page.source === "ocr").length;
    if (ocrCount > 0) {
      warnings.unshift(
        `${ocrCount} ${ocrCount === 1 ? "page was" : "pages were"} routed through the local OCR pipeline.`,
      );
    }
    return {
      kind: "pdf",
      fileName: file.name,
      fileSize: file.size,
      pages,
      text: pages
        .map((page) => `<!-- Page ${page.pageNumber} · ${page.source} -->\n\n${page.text}`)
        .join("\n\n"),
      warnings,
      elapsedMs: performance.now() - startedAt,
    };
  } finally {
    await document?.cleanup();
    await loadingTask.destroy();
  }
};

const parseDocx = async (
  file: File,
  options: DocumentParserOptions,
): Promise<ParsedDocxDocument> => {
  const startedAt = performance.now();
  options.onProgress?.({ stage: "converting", label: "Converting DOCX to semantic HTML" });
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      externalFileAccess: false,
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
    },
  );
  const html = sanitizeDocxHtml(result.value);
  options.onProgress?.({
    stage: "extracting",
    label: "Inspecting DOCX structure with docx-preview (experimental)",
  });
  const docxPreviewParser = await inspectDocxPreviewParser(file);
  const warnings = result.messages.map((message) => message.message);
  if (docxPreviewParser.status === "unavailable") {
    warnings.push(
      "docx-preview.parseAsync() could not inspect this file; Mammoth text extraction is still available.",
    );
  }
  return {
    kind: "docx",
    fileName: file.name,
    fileSize: file.size,
    html,
    text: htmlToPlainText(html),
    docxPreviewParser,
    warnings,
    elapsedMs: performance.now() - startedAt,
  };
};

const compactText = (value: string): string => value.replace(/\s+/g, " ").trim();

const collectPptxElements = (elements: PptxElement[]): PptxElement[] =>
  elements.flatMap((element) =>
    element.type === "group" ? [element, ...collectPptxElements(element.children)] : [element],
  );

const collectPptxText = (elements: PptxElement[]): string[] =>
  collectPptxElements(elements).flatMap((element) => {
    if (element.type === "table") {
      return (element.tableData?.rows ?? [])
        .flatMap((row) => row.cells.map((cell) => compactText(cell.text ?? "")))
        .filter(Boolean);
    }
    if ("text" in element && typeof element.text === "string") {
      const text = compactText(element.text);
      return text ? [text] : [];
    }
    return [];
  });

const getImageName = (element: Extract<PptxElement, { type: "image" | "picture" }>): string =>
  element.imagePath ?? `image-${element.id}`;

const dataUrlToFile = (dataUrl: string, name: string): { file: File; mimeType: string } | null => {
  const match = /^data:([^;,]+);base64,(.*)$/is.exec(dataUrl);
  if (!match) return null;
  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { file: new File([bytes], name, { type: mimeType }), mimeType };
};

const parsePptx = async (
  file: File,
  options: DocumentParserOptions,
): Promise<ParsedPptxDocument> => {
  if (file.size > MAX_PPTX_FILE_SIZE_BYTES) {
    throw new Error("Choose a PPTX smaller than 100 MB for this browser demo.");
  }
  const startedAt = performance.now();
  const warnings: string[] = [];
  options.onProgress?.({ stage: "reading", label: "Opening PPTX package" });
  const fileBuffer = await file.arrayBuffer();
  const viewerContent = new Uint8Array(fileBuffer.slice(0));
  const handler = new PptxHandler();

  try {
    const data = await handler.load(fileBuffer, {
      eagerDecodeImages: true,
      maxUncompressedBytes: MAX_PPTX_UNCOMPRESSED_BYTES,
      allowExternalImages: false,
    });
    options.onProgress?.({ stage: "extracting", label: "Extracting slides, notes, and images" });

    options.onProgress?.({ stage: "converting", label: "Converting slides to Markdown" });
    const markdownConverter = new PptxMarkdownConverter("", {
      sourceName: file.name,
      includeSpeakerNotes: true,
      mediaFolderName: "media",
      includeMetadata: true,
      semanticMode: true,
    });
    const markdown = await markdownConverter.convert(data);

    const imagesByName = new Map<string, ParsedPptxImage>();
    const slides = data.slides.map((slide, index) => {
      const imageAttachmentNames: string[] = [];
      for (const element of collectPptxElements(slide.elements)) {
        if (element.type !== "image" && element.type !== "picture") continue;
        const imageName = getImageName(element);
        if (!imagesByName.has(imageName) && element.imageData) {
          const parsedImage = dataUrlToFile(element.imageData, imageName);
          if (parsedImage) {
            imagesByName.set(imageName, {
              name: imageName,
              mimeType: parsedImage.mimeType,
              altText: element.altText,
              file: parsedImage.file,
            });
          } else {
            warnings.push(`Image ${imageName} could not be prepared for local OCR.`);
          }
        }
        if (imagesByName.has(imageName)) imageAttachmentNames.push(imageName);
      }

      return {
        slideNumber: slide.slideNumber || index + 1,
        text: collectPptxText(slide.elements).join("\n"),
        notes: slide.notes ? [compactText(slide.notes)].filter(Boolean) : [],
        comments: (slide.comments ?? [])
          .map((comment) => compactText([comment.author, comment.text].filter(Boolean).join(": ")))
          .filter(Boolean),
        imageAttachmentNames: [...new Set(imageAttachmentNames)],
      };
    });
    warnings.push(...(data.warnings ?? []).map((warning) => warning.message));
    warnings.push(...handler.getCompatibilityWarnings().map((warning) => warning.message));

    return {
      kind: "pptx",
      fileName: file.name,
      fileSize: file.size,
      viewerContent,
      title: data.coreProperties?.title,
      author: data.coreProperties?.creator,
      slides,
      images: [...imagesByName.values()],
      markdown,
      text: slides
        .map((slide) => {
          const notes = slide.notes.length ? `\n\nSpeaker notes:\n${slide.notes.join("\n")}` : "";
          return `<!-- Slide ${slide.slideNumber} -->\n\n${slide.text}${notes}`;
        })
        .join("\n\n"),
      warnings: [...new Set(warnings)],
      elapsedMs: performance.now() - startedAt,
    };
  } finally {
    handler.dispose();
  }
};

export const getSupportedDocumentKind = (file: File): ParsedDocumentKind | null => {
  const fileName = file.name.toLowerCase();
  if (file.type === "application/pdf" || fileName.endsWith(".pdf")) return "pdf";
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  ) {
    return "docx";
  }
  if (
    file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    fileName.endsWith(".pptx")
  ) {
    return "pptx";
  }
  return null;
};

export const parseDocumentFile = async (
  file: File,
  options: DocumentParserOptions = {},
): Promise<ParsedDocument> => {
  const kind = getSupportedDocumentKind(file);
  if (kind === "pdf") return parsePdf(file, options);
  if (kind === "docx") return parseDocx(file, options);
  if (kind === "pptx") return parsePptx(file, options);
  throw new Error("Choose a PDF, DOCX, or PPTX file.");
};

export const getDocumentParseErrorMessage = (error: unknown): string =>
  `Unable to parse this document: ${getErrorMessage(error)}`;
