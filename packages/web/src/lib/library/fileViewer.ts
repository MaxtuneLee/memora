import {
  getFileExtension,
  isEditableTextDocument,
  normalizeMimeType,
} from "@/lib/editor/editableTextDocument";
import type { FileMeta } from "@/types/library";

type FileViewerCandidate = Pick<FileMeta, "id" | "mimeType" | "name" | "type">;

const VIEWABLE_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const VIEWABLE_DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx", ".pptx"]);

export const isFileViewerFile = (file: FileViewerCandidate): boolean => {
  if (file.type === "image") {
    return true;
  }

  if (file.type !== "document" || isEditableTextDocument(file)) {
    return false;
  }

  return (
    VIEWABLE_DOCUMENT_MIME_TYPES.has(normalizeMimeType(file.mimeType)) ||
    VIEWABLE_DOCUMENT_EXTENSIONS.has(getFileExtension(file.name))
  );
};

export const getFileViewerHref = (fileId: string): string => `/files/file/${fileId}`;
