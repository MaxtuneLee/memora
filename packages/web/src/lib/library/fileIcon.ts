import {
  FileDocIcon,
  FileMdIcon,
  FilePdfIcon,
  FilePptIcon,
  FileTextIcon,
  ImageIcon,
  MicrophoneIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { getFileExtension, normalizeMimeType } from "@/lib/editor/editableTextDocument";
import type { FileMeta } from "@/types/library";

type FileIconCandidate = Pick<FileMeta, "mimeType" | "name" | "type">;

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME_TYPE = "application/pdf";
const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const MARKDOWN_MIME_TYPES = new Set(["text/markdown", "application/markdown", "text/x-markdown"]);

export const getFileIcon = (file: FileIconCandidate): typeof FileTextIcon => {
  if (file.type === "audio") return MicrophoneIcon;
  if (file.type === "video") return VideoCameraIcon;
  if (file.type === "image") return ImageIcon;

  const mimeType = normalizeMimeType(file.mimeType);
  const extension = getFileExtension(file.name);

  if (mimeType === DOCX_MIME_TYPE || extension === ".docx") return FileDocIcon;
  if (mimeType === PDF_MIME_TYPE || extension === ".pdf") return FilePdfIcon;
  if (mimeType === PPTX_MIME_TYPE || extension === ".pptx") return FilePptIcon;
  if (MARKDOWN_MIME_TYPES.has(mimeType) || extension === ".md" || extension === ".markdown") {
    return FileMdIcon;
  }

  return FileTextIcon;
};
