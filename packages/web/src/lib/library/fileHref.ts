import { getDocumentEditorHref, isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import type { FileMeta } from "@/types/library";

export const getFileHref = (file: Pick<FileMeta, "id" | "mimeType" | "name" | "type">): string => {
  if (file.type === "audio" || file.type === "video") {
    return `/transcript/file/${file.id}`;
  }

  if (isEditableTextDocument(file)) {
    return getDocumentEditorHref(file.id);
  }

  return "/desktop";
};
