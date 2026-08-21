import type { FileMeta } from "@/types/library";

const EDITABLE_TEXT_MIME_TYPES = new Set(["application/markdown", "text/markdown", "text/plain"]);

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const PLAIN_TEXT_EXTENSIONS = new Set([".txt"]);
const INVALID_PATH_SEPARATOR_PATTERN = /[\\/]/g;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/gu;
const WHITESPACE_PATTERN = /\s+/g;

export const normalizeMimeType = (mimeType: string): string => {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
};

export const getFileExtension = (name: string): string => {
  const trimmedName = name.trim();
  const extensionIndex = trimmedName.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === trimmedName.length - 1) {
    return "";
  }

  return trimmedName.slice(extensionIndex).toLowerCase();
};

export const hasEditableTextExtension = (name: string): boolean => {
  const extension = getFileExtension(name);
  return MARKDOWN_EXTENSIONS.has(extension) || PLAIN_TEXT_EXTENSIONS.has(extension);
};

export const inferPreferredEditableTextExtension = (mimeType: string): ".md" | ".txt" => {
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (normalizedMimeType === "text/plain") {
    return ".txt";
  }

  return ".md";
};

const sanitizeEditableTextLogicalBaseName = (name: string, fallbackName: string): string => {
  const sanitized = name
    .replace(INVALID_PATH_SEPARATOR_PATTERN, "-")
    .replace(CONTROL_CHARACTER_PATTERN, "")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();

  return sanitized || fallbackName;
};

export const normalizeEditableTextDocumentName = (name: string, mimeType: string): string => {
  const trimmedName = name.trim();
  const extension = getFileExtension(trimmedName);
  const baseName = extension ? trimmedName.slice(0, -extension.length) : trimmedName;
  const normalizedBaseName = sanitizeEditableTextLogicalBaseName(
    baseName || trimmedName,
    "Untitled note",
  );

  if (hasEditableTextExtension(trimmedName)) {
    return `${normalizedBaseName}${extension}`;
  }

  return `${normalizedBaseName}${inferPreferredEditableTextExtension(mimeType)}`;
};

export const isEditableTextDocument = (
  file: Pick<FileMeta, "mimeType" | "name" | "type">,
): boolean => {
  if (file.type !== "document") {
    return false;
  }

  const normalizedMimeType = normalizeMimeType(file.mimeType);
  if (EDITABLE_TEXT_MIME_TYPES.has(normalizedMimeType)) {
    return true;
  }

  return hasEditableTextExtension(file.name);
};

export const getDocumentEditorHref = (fileId: string): string => {
  return `/editor/file/${fileId}`;
};
