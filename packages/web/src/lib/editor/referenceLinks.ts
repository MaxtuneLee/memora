export interface ReferenceAnchor {
  startLine: number | null;
  endLine: number | null;
}

export interface BuildReferenceLinkInput {
  label: string;
  relativePath: string;
  startLine?: number | null;
  endLine?: number | null;
}

export interface ParsedReferenceLink extends ReferenceAnchor {
  label: string;
  relativePath: string;
}

const LINE_ANCHOR_PATTERN = /^#L(\d+)(?:-L(\d+))?$/i;
const MARKDOWN_LINK_PATTERN = /^\[((?:\\.|[^\]\\])*)\]\((.*)\)$/;
const MARKDOWN_LABEL_ESCAPE_PATTERN = /[\\[\]()/]/g;
const MARKDOWN_LABEL_UNESCAPE_PATTERN = /\\([\\[\]()/])/g;

const normalizeLineNumber = (line: number | null | undefined): number | null => {
  if (!Number.isInteger(line) || (line ?? 0) <= 0) {
    return null;
  }

  return line ?? null;
};

export const buildLineAnchor = (
  startLine: number | null | undefined,
  endLine?: number | null,
): string => {
  const normalizedStartLine = normalizeLineNumber(startLine);
  if (!normalizedStartLine) {
    return "";
  }

  const normalizedEndLine = normalizeLineNumber(endLine);
  if (normalizedEndLine && normalizedEndLine > normalizedStartLine) {
    return `#L${normalizedStartLine}-L${normalizedEndLine}`;
  }

  return `#L${normalizedStartLine}`;
};

export const parseLineAnchor = (anchor: string): ReferenceAnchor | null => {
  const trimmedAnchor = anchor.trim();
  const match = LINE_ANCHOR_PATTERN.exec(trimmedAnchor);
  if (!match) {
    return null;
  }

  const startLine = Number.parseInt(match[1] ?? "", 10);
  const endLine = match[2] ? Number.parseInt(match[2], 10) : null;

  if (!Number.isInteger(startLine) || startLine <= 0) {
    return null;
  }

  if (endLine != null && (!Number.isInteger(endLine) || endLine <= startLine)) {
    return null;
  }

  return {
    startLine,
    endLine,
  };
};

const escapeMarkdownLabel = (label: string): string => {
  return label.replace(MARKDOWN_LABEL_ESCAPE_PATTERN, "\\$&");
};

const unescapeMarkdownLabel = (label: string): string => {
  return label.replace(MARKDOWN_LABEL_UNESCAPE_PATTERN, "$1");
};

const encodeMarkdownLinkTarget = (relativePath: string): string => {
  return relativePath
    .trim()
    .split("/")
    .map((segment) => {
      return encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29");
    })
    .join("/");
};

const decodeMarkdownLinkTarget = (encodedPath: string): string | null => {
  try {
    return encodedPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
};

export const buildReferenceLink = ({
  label,
  relativePath,
  startLine,
  endLine,
}: BuildReferenceLinkInput): string => {
  const normalizedLabel = escapeMarkdownLabel(label.trim() || "Untitled");
  const normalizedPath = encodeMarkdownLinkTarget(relativePath);
  const anchor = buildLineAnchor(startLine, endLine);

  return `[${normalizedLabel}](${normalizedPath}${anchor})`;
};

export const parseReferenceLink = (markdownLink: string): ParsedReferenceLink | null => {
  const match = MARKDOWN_LINK_PATTERN.exec(markdownLink.trim());
  if (!match) {
    return null;
  }

  const label = unescapeMarkdownLabel(match[1] ?? "");
  const target = match[2] ?? "";
  const hashIndex = target.indexOf("#");
  const relativePathText = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const anchorText = hashIndex >= 0 ? target.slice(hashIndex) : "";
  const relativePath = decodeMarkdownLinkTarget(relativePathText);
  if (relativePath == null) {
    return null;
  }

  const anchor = anchorText ? parseLineAnchor(anchorText) : null;
  if (anchorText && !anchor) {
    return null;
  }

  return {
    label,
    relativePath,
    startLine: anchor?.startLine ?? null,
    endLine: anchor?.endLine ?? null,
  };
};
