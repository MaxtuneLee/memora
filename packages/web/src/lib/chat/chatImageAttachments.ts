import { dir as opfsDir, file as opfsFile, write as opfsWrite } from "@memora/fs";

import type { file as LiveStoreFile } from "@/livestore/file";
import type { ChatWidget } from "@/lib/chat/showWidget";

const CHAT_SESSION_ASSETS_DIR = "/chat/session-assets";

export const MAX_CHAT_IMAGE_ATTACHMENTS = 4;
export const MAX_CHAT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface ChatImageAttachment {
  id: string;
  kind: "image";
  source: "local" | "library";
  name: string;
  mimeType: string;
  sizeBytes: number;
  assetPath?: string;
  fileId?: string;
  storagePath?: string;
  savedFileId?: string;
}

export interface ChatInputImage {
  attachment: ChatImageAttachment;
  data: string;
}

const isImageMimeType = (mimeType: string): boolean => {
  return /^image\//i.test(mimeType.trim());
};

const deriveExtension = (mimeType: string, name: string): string => {
  const nameMatch = name.match(/\.([a-z0-9]+)$/i);
  if (nameMatch?.[1]) {
    return nameMatch[1].toLowerCase();
  }

  const mimePart = mimeType.split("/")[1] ?? "bin";
  const normalized = mimePart.split("+")[0]?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized || "bin";
};

const normalizePositiveNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
};

const normalizeOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

export const validateChatImageFile = (file: {
  type: string;
  size: number;
}): string | null => {
  if (!isImageMimeType(file.type)) {
    return "Only image files can be attached.";
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "This image could not be read.";
  }

  if (file.size > MAX_CHAT_IMAGE_SIZE_BYTES) {
    return "Each image must be 5 MB or smaller.";
  }

  return null;
};

export const getChatSessionAssetsDir = (sessionId: string): string => {
  const safeSessionId = sessionId.trim();
  if (!safeSessionId) {
    throw new Error("Session id is required");
  }

  return `${CHAT_SESSION_ASSETS_DIR}/${safeSessionId}`;
};

const buildChatSessionAssetPath = (
  sessionId: string,
  attachmentId: string,
  mimeType: string,
  name: string,
): string => {
  const extension = deriveExtension(mimeType, name);
  return `${getChatSessionAssetsDir(sessionId)}/${attachmentId}.${extension}`;
};

export const createLocalChatImageAttachment = async (
  sessionId: string,
  file: File,
): Promise<ChatImageAttachment> => {
  const validationError = validateChatImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const attachmentId = crypto.randomUUID();
  const assetPath = buildChatSessionAssetPath(
    sessionId,
    attachmentId,
    file.type,
    file.name,
  );

  await opfsDir(getChatSessionAssetsDir(sessionId)).create();
  await opfsWrite(assetPath, await file.arrayBuffer(), { overwrite: true });

  return {
    id: attachmentId,
    kind: "image",
    source: "local",
    name: file.name || `Image ${new Date().toLocaleString()}`,
    mimeType: file.type,
    sizeBytes: file.size,
    assetPath,
  };
};

export const createLibraryChatImageAttachment = (
  file: Pick<LiveStoreFile, "id" | "name" | "mimeType" | "sizeBytes" | "storagePath">,
): ChatImageAttachment => {
  const validationError = validateChatImageFile({
    type: file.mimeType,
    size: file.sizeBytes,
  });
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    id: crypto.randomUUID(),
    kind: "image",
    source: "library",
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    fileId: file.id,
    storagePath: file.storagePath,
  };
};

export const normalizeChatImageAttachment = (
  value: unknown,
): ChatImageAttachment | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<ChatImageAttachment>;
  const id = normalizeOptionalText(candidate.id);
  const name = normalizeOptionalText(candidate.name);
  const mimeType = normalizeOptionalText(candidate.mimeType);
  const sizeBytes = normalizePositiveNumber(candidate.sizeBytes);
  const assetPath = normalizeOptionalText(candidate.assetPath);
  const fileId = normalizeOptionalText(candidate.fileId);
  const storagePath = normalizeOptionalText(candidate.storagePath);
  const savedFileId = normalizeOptionalText(candidate.savedFileId);

  if (
    !id ||
    candidate.kind !== "image" ||
    (candidate.source !== "local" && candidate.source !== "library") ||
    !name ||
    !mimeType ||
    sizeBytes === null ||
    !isImageMimeType(mimeType)
  ) {
    return null;
  }

  if (candidate.source === "local" && !assetPath) {
    return null;
  }

  if (candidate.source === "library" && (!fileId || !storagePath)) {
    return null;
  }

  return {
    id,
    kind: "image",
    source: candidate.source,
    name,
    mimeType,
    sizeBytes,
    ...(assetPath ? { assetPath } : {}),
    ...(fileId ? { fileId } : {}),
    ...(storagePath ? { storagePath } : {}),
    ...(savedFileId ? { savedFileId } : {}),
  };
};

export const normalizeChatImageAttachments = (
  value: unknown,
): ChatImageAttachment[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: ChatImageAttachment[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const attachment = normalizeChatImageAttachment(item);
    if (!attachment || seen.has(attachment.id)) {
      continue;
    }

    seen.add(attachment.id);
    normalized.push(attachment);
  }

  return normalized.length > 0 ? normalized : undefined;
};

const resolveOpfsBlob = async (
  path: string,
  mimeType: string,
): Promise<Blob | null> => {
  try {
    const file = opfsFile(path);
    const originFile = await file.getOriginFile();
    if (originFile) {
      return originFile;
    }

    const buffer = await file.arrayBuffer();
    return new Blob([buffer], { type: mimeType });
  } catch {
    return null;
  }
};

export const resolveChatImageAttachmentBlob = async (
  attachment: ChatImageAttachment,
): Promise<Blob | null> => {
  const path =
    attachment.source === "local" ? attachment.assetPath : attachment.storagePath;

  if (!path) {
    return null;
  }

  if (path.startsWith("/")) {
    return resolveOpfsBlob(path, attachment.mimeType);
  }

  try {
    const response = await fetch(path);
    if (!response.ok) {
      return null;
    }

    return await response.blob();
  } catch {
    return null;
  }
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read image data."));
        return;
      }

      const commaIndex = reader.result.indexOf(",");
      resolve(
        commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result,
      );
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Could not read image data."));
    };

    reader.readAsDataURL(blob);
  });
};

export const attachmentToChatInputImage = async (
  attachment: ChatImageAttachment,
): Promise<ChatInputImage> => {
  const blob = await resolveChatImageAttachmentBlob(attachment);
  if (!blob) {
    throw new Error(`Couldn't read image "${attachment.name}".`);
  }

  return {
    attachment,
    data: await blobToBase64(blob),
  };
};

const createAttachmentSummary = (
  attachments: ChatImageAttachment[] | undefined,
): string => {
  const images = attachments ?? [];
  if (images.length === 0) {
    return "";
  }

  if (images.length === 1) {
    return images[0]?.name.trim() ?? "Image";
  }

  return `${images.length} images`;
};

const trimPreview = (value: string, maxLength: number): string => {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
};

const createWidgetSummary = (widgets?: ChatWidget[]): string => {
  if (!widgets || widgets.length === 0) {
    return "";
  }

  const firstNamedWidget = widgets.find((widget) => widget.title.trim().length > 0);
  if (firstNamedWidget) {
    return `Widget: ${firstNamedWidget.title}`;
  }

  if (widgets.length === 1) {
    return "Interactive widget";
  }

  return `${widgets.length} widgets`;
};

export const getChatMessagePreviewText = (message: {
  content: string;
  attachments?: ChatImageAttachment[];
  widgets?: ChatWidget[];
}): string => {
  const text = trimPreview(message.content, 80);
  if (text) {
    return text;
  }

  const widgetSummary = trimPreview(createWidgetSummary(message.widgets), 80);
  if (widgetSummary) {
    return widgetSummary;
  }

  return trimPreview(createAttachmentSummary(message.attachments), 80);
};

export const getChatMessageTitleText = (message: {
  content: string;
  attachments?: ChatImageAttachment[];
  widgets?: ChatWidget[];
}): string | null => {
  const text = trimPreview(message.content, 48);
  if (text) {
    return text;
  }

  const widgetSummary = trimPreview(createWidgetSummary(message.widgets), 48);
  if (widgetSummary) {
    return widgetSummary;
  }

  const summary = trimPreview(createAttachmentSummary(message.attachments), 48);
  return summary || null;
};

export const deleteChatSessionAssets = async (
  sessionId: string,
): Promise<void> => {
  await opfsDir(getChatSessionAssetsDir(sessionId)).remove({
    recursive: true,
    force: true,
  });
};

export const deleteChatImageAttachmentAsset = async (
  attachment: ChatImageAttachment,
): Promise<void> => {
  if (attachment.source !== "local" || !attachment.assetPath) {
    return;
  }

  await opfsFile(attachment.assetPath).remove({ force: true });
};
