import type {
  ContentArtifact,
  ContentArtifactDraft,
  ContentParser,
  ContentParserContext,
  ContentSegment,
} from "./types";
import { createStableSegmentId } from "./sourceRevision";
import { textContentParser } from "./parsers/text";
import { transcriptContentParser } from "./parsers/transcript";

const IMAGE_EXTENSIONS = [".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"];

const isImageFile = (file: Pick<File, "name" | "type">): boolean => {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") || IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
};

const imageContentParser: ContentParser = {
  name: "image",
  version: "image-v1",
  supports: isImageFile,
  parse: async (context) => {
    const { imageContentParser: parser } = await import("./parsers/image");
    return parser.parse(context);
  },
};

const isDocumentFile = (file: Pick<File, "name" | "type">): boolean => {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/pdf" ||
    name.endsWith(".pdf") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    name.endsWith(".pptx")
  );
};

const DOCUMENT_PARSER: ContentParser = {
  name: "document",
  version: "document-v3",
  supports: isDocumentFile,
  parse: async ({ file, signal, onProgress }) => {
    if (signal?.aborted) throw new DOMException("Parsing was cancelled", "AbortError");
    const { getSupportedDocumentKind, parseDocumentFile } = await import("./parsers/document");
    if (!getSupportedDocumentKind(file)) {
      throw new Error(`Unsupported document format: ${file.name}`);
    }
    const parsed = await parseDocumentFile(file, {
      onProgress: (progress) =>
        onProgress?.({
          label: progress.label,
          current: progress.current,
          total: progress.total,
        }),
    });
    if (parsed.kind === "pdf") {
      return {
        title: file.name.replace(/\.pdf$/i, ""),
        markdown: parsed.text,
        plainText: parsed.pages.map((page) => page.text).join("\n\n"),
        segments: parsed.pages.map((page) => ({
          kind: "text" as const,
          text: page.text,
          markdown: `<!-- Page ${page.pageNumber} · ${page.source} -->\n\n${page.text}`,
          headingPath: [],
          locator: { kind: "page" as const, pageNumber: page.pageNumber },
          searchable: Boolean(page.text.trim()),
        })),
        warnings: parsed.warnings.map((message) => ({ code: "document-warning", message })),
      } satisfies ContentArtifactDraft;
    }
    if (parsed.kind === "docx") {
      return {
        title: file.name.replace(/\.docx$/i, ""),
        markdown: parsed.text,
        plainText: parsed.text,
        segments: splitMarkdownSegments(parsed.text),
        warnings: parsed.warnings.map((message) => ({ code: "document-warning", message })),
      } satisfies ContentArtifactDraft;
    }
    return {
      title: parsed.title ?? file.name.replace(/\.pptx$/i, ""),
      markdown: parsed.markdown,
      plainText: parsed.text,
      segments: splitPptxMarkdownSegments(parsed.markdown, parsed.slides),
      warnings: parsed.warnings.map((message) => ({ code: "document-warning", message })),
    } satisfies ContentArtifactDraft;
  },
};

const splitMarkdownSegments = (markdown: string): ContentArtifactDraft["segments"] => {
  const segments: ContentArtifactDraft["segments"] = [];
  const headingPath: string[] = [];
  for (const block of markdown.split(/\n{2,}/)) {
    const text = block.trim();
    if (!text) continue;
    const heading = text.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = heading[2].trim();
      segments.push({
        kind: "title",
        text: heading[2].trim(),
        headingPath: [...headingPath],
        locator: { kind: "text", startOffset: 0, endOffset: text.length },
        searchable: true,
      });
    } else {
      segments.push({
        kind: "text",
        text,
        markdown: text,
        headingPath: [...headingPath],
        locator: { kind: "text", startOffset: 0, endOffset: text.length },
        searchable: true,
      });
    }
  }
  return segments;
};

const markdownToPlainText = (markdown: string): string =>
  markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[|`*_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const createPptxFallbackSegments = (
  slides: ReadonlyArray<{ slideNumber: number; text: string; notes: string[]; comments: string[] }>,
): ContentArtifactDraft["segments"] =>
  slides.map((slide) => {
    const text = [slide.text, ...slide.notes, ...slide.comments].filter(Boolean).join("\n");
    return {
      kind: "text" as const,
      text,
      markdown: `## Slide ${slide.slideNumber}\n\n${text}`,
      headingPath: [`Slide ${slide.slideNumber}`],
      locator: { kind: "slide" as const, slideNumber: slide.slideNumber },
      searchable: Boolean(text.trim()),
    };
  });

export const splitPptxMarkdownSegments = (
  markdown: string,
  slides: ReadonlyArray<{ slideNumber: number; text: string; notes: string[]; comments: string[] }>,
): ContentArtifactDraft["segments"] => {
  const slideHeadingPattern = /^##[\t ]+Slide[\t ]+(\d+)(?::[\t ]*(.*?))?[\t ]*$/gim;
  const matches = [...markdown.matchAll(slideHeadingPattern)];
  if (!matches.length) return createPptxFallbackSegments(slides);

  const segments: ContentArtifactDraft["segments"] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const slideNumber = Number(match[1]);
    if (!Number.isInteger(slideNumber)) continue;
    const slideTitle = (match[2] ?? "").replace(/\s+\*\([^)]*\)\*\s*$/, "").trim();
    const slideLabel = slideTitle || `Slide ${slideNumber}`;
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? markdown.length;
    const slideSection = markdown.slice(start, end);
    const separatorIndex = slideSection.search(/\n{2,}---[\t ]*(?:\r?\n|$)/);
    const slideMarkdown = slideSection
      .slice(0, separatorIndex >= 0 ? separatorIndex : undefined)
      .trim();
    const blocks = slideMarkdown
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block && block !== "---");
    const headingPath = [slideLabel];

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex];
      const heading = block.match(/^(#{1,6})\s+(.+)$/);
      const isSlideHeading = blockIndex === 0;
      if (heading && !isSlideHeading) {
        const level = Math.max(1, heading[1].length - 2);
        headingPath.splice(level);
        headingPath[level] = heading[2].trim();
      }
      const text = isSlideHeading ? slideLabel : markdownToPlainText(block);
      segments.push({
        kind: heading ? "title" : "text",
        text,
        markdown: block,
        headingPath: [...headingPath],
        locator: { kind: "slide", slideNumber },
        searchable: Boolean(text),
      });
    }
  }

  return segments.length ? segments : createPptxFallbackSegments(slides);
};

const DEFAULT_PARSERS: ContentParser[] = [
  textContentParser,
  transcriptContentParser,
  imageContentParser,
  DOCUMENT_PARSER,
];

export class ContentParserRegistry {
  private readonly parsers: ContentParser[];

  constructor(parsers: ContentParser[] = DEFAULT_PARSERS) {
    this.parsers = [...parsers];
  }

  register(parser: ContentParser): void {
    this.parsers.unshift(parser);
  }

  resolve(file: Pick<File, "name" | "type">): ContentParser | null {
    return this.parsers.find((parser) => parser.supports(file)) ?? null;
  }

  async parse(context: ContentParserContext): Promise<ContentArtifact> {
    const parser = this.resolve(context.file);
    if (!parser) throw new Error(`No content parser is registered for ${context.file.name}.`);
    const draft = await parser.parse(context);
    const segments: ContentSegment[] = [];
    for (let index = 0; index < draft.segments.length; index += 1) {
      const segment = draft.segments[index];
      if (context.signal?.aborted) throw new DOMException("Parsing was cancelled", "AbortError");
      segments.push({
        ...segment,
        id: await createStableSegmentId({
          fileId: context.fileId,
          sourceRevision: context.sourceRevision,
          ordinal: index,
          kind: segment.kind,
          text: segment.text,
          locator: segment.locator,
        }),
      });
    }
    const plainText = draft.plainText ?? segments.map((segment) => segment.text).join("\n\n");
    return {
      schemaVersion: 1,
      fileId: context.fileId,
      sourceRevision: context.sourceRevision,
      parser: { name: parser.name, version: parser.version },
      title: draft.title ?? context.file.name,
      markdown: draft.markdown,
      plainText,
      segments,
      warnings: draft.warnings ?? [],
      createdAt: Date.now(),
    };
  }
}

export const contentParserRegistry = new ContentParserRegistry();
